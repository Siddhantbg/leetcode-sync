import {
  discardSlotsExcept,
  getProblemIndex,
  getProblemSlots,
  getSettings,
  getStats,
  getToken,
  markSubmissionSeen,
  setLastSubmission,
  setProblemEntry,
  setProblemSlots,
  setStats,
  updateProblemIndex,
} from '@/storage';
import {
  commitFile,
  friendlyMessage,
  getFileContent,
  GitHubApiError,
} from '@/github';
import type {
  ForceSyncMode,
  Settings,
  SolutionApproach,
  SolvedProblem,
  Stats,
  Submission,
  SyncResult,
} from '@/types';
import { ANALYSIS_VERSION, analyzeSolution, stripSyncHeader } from '@/utils/analysis';
import { submissionKey } from '@/utils/approach';
import { classifySolutions, displayLabel } from '@/utils/classify';
import { buildFileContent } from '@/utils/content';
import { hashString } from '@/utils/hash';
import { buildFilePath, buildSolutionPath } from '@/utils/path';
import { withRetry } from '@/utils/retry';
import {
  codeHash,
  effectiveComplexity,
  fingerprint,
  normalizeProblemEntry,
  resolveSolutionTarget,
  type SolutionTarget,
} from '@/utils/solution';
import { applySlot, armedSlot, withoutSlot } from '@/utils/slots';
import { applySync, touchStreakForActivity } from '@/utils/stats';
import { renderCommitMessage } from '@/utils/template';
import { notify } from './notify';
import { commitProblemReadmes, commitProgressReadme } from './readmes';
import { updateSyncState } from './state';

export interface SyncOptions {
  /** Re-commit even when the exact code is already saved (Force Sync). */
  force?: boolean;
  /** Show a desktop notification on success/failure (default true). */
  notifyUser?: boolean;
  /** Append new notes below existing README notes instead of replacing. */
  appendNotes?: boolean;
  /** "new" = save as a separate solution unless the exact code exists. */
  mode?: ForceSyncMode;
}

/** Legacy solutions are fetched from GitHub once to compute hash + analysis. */
const MAX_HYDRATE = 8;

function needsHydration(s: SolutionApproach): boolean {
  return Boolean(s.path) && (!s.analysis || s.analysis.version < ANALYSIS_VERSION);
}

/**
 * Fill in code hash, fingerprint and analysis for solutions synced by older
 * versions (best-effort; failures leave the solution unchanged).
 */
async function hydrateSolutions(
  token: string,
  settings: Settings,
  solutions: SolutionApproach[],
): Promise<SolutionApproach[]> {
  const { username: owner, repo, branch } = settings.github;
  let budget = MAX_HYDRATE;
  return Promise.all(
    solutions.map(async (s) => {
      if (!needsHydration(s) || budget-- <= 0) return s;
      try {
        const file = await getFileContent(token, owner, repo, s.path, branch);
        if (!file) return { ...s, analysis: { version: ANALYSIS_VERSION } };
        const code = stripSyncHeader(file.content);
        const analysis = analyzeSolution(code, s.language);
        return {
          ...s,
          codeHash: codeHash(code),
          fingerprint: fingerprint(code, s.language),
          analysis,
          timeComplexity: effectiveComplexity(
            undefined, s.timeComplexity, s.analysis?.timeComplexity, analysis.timeComplexity, true,
          ),
          spaceComplexity: effectiveComplexity(
            undefined, s.spaceComplexity, s.analysis?.spaceComplexity, analysis.spaceComplexity, true,
          ),
        };
      } catch (err) {
        console.warn('[LeetCode Sync] could not read legacy solution', s.path, err);
        return s;
      }
    }),
  );
}

/**
 * Users who synced before the problem index was always maintained may have a
 * primary on GitHub that only appears in stats.syncedKeys. Represent it so the
 * new submission is compared against it instead of overwriting it.
 */
function withLegacyPrimary(
  solutions: SolutionApproach[],
  submission: Submission,
  settings: Settings,
  stats: Stats,
): SolutionApproach[] {
  const key = submissionKey(submission.number, submission.language);
  if (
    solutions.some((s) => s.language === submission.language) ||
    !stats.syncedKeys.includes(key)
  ) {
    return solutions;
  }
  const at = Date.now() - 1;
  return [
    ...solutions,
    {
      key,
      language: submission.language,
      path: buildFilePath(settings, { ...submission, approach: undefined }),
      syncedAt: at,
      createdAt: at,
      labelSource: 'auto',
    },
  ];
}

function describe(
  kind: SolutionTarget['kind'],
  saved: SolutionApproach | undefined,
  entry: SolvedProblem | undefined,
): string {
  const label = saved ? displayLabel(saved) : 'solution';
  const best = saved && entry?.bestKey === saved.key && (entry.solutions?.length ?? 0) > 1 ? ' ⭐' : '';
  switch (kind) {
    case 'new':
      return saved?.approach ? `New solution saved: ${label}${best}` : 'Saved as primary solution';
    case 'revision':
      return `Updated ${label}${best} (near-identical resubmission)`;
    default:
      return `Re-synced ${label}${best}`;
  }
}

/**
 * Core sync workflow. The single place that turns a Submission into a GitHub
 * commit, updates statistics, and reports status. Never called from the content
 * script — only from the background message router.
 *
 *   submission → identity (code hash) → duplicate | revision | new solution
 *              → analysis (complexity, pattern) → classification (labels, best)
 *              → file + READMEs
 */
export async function syncSubmission(
  incoming: Submission,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const { force = false, notifyUser = true, appendNotes = false, mode = 'auto' } = options;

  // Remember it so Force Sync works even after the worker restarts.
  await setLastSubmission(incoming);

  const [token, settings] = await Promise.all([getToken(), getSettings()]);
  const { username, repo, branch } = settings.github;

  if (!token || !username || !repo) {
    const error = 'Not connected. Add a token and repository in Settings.';
    await updateSyncState({ status: 'error', error });
    return { ok: false, error };
  }

  // A named slot selected in the popup claims this submission; unused slots
  // on other problems are abandoned.
  await discardSlotsExcept(incoming.number);
  const slot = incoming.approach ? undefined : armedSlot(await getProblemSlots(incoming.number));
  const submission = slot ? applySlot(incoming, slot) : incoming;
  const releaseSlot = async () => {
    if (!slot) return;
    const current = await getProblemSlots(submission.number);
    await setProblemSlots(submission.number, withoutSlot(current, slot.id));
  };

  const [stats0, index0] = await Promise.all([getStats(), getProblemIndex()]);
  const rawHash = hashString(submission.code);
  const hash = codeHash(submission.code);
  const analysis = analyzeSolution(submission.code, submission.language);
  const fp = fingerprint(submission.code, submission.language);

  const stored = index0[submission.number];
  const before = stored ? normalizeProblemEntry(stored, submission.language) : undefined;
  let solutions = withLegacyPrimary(before?.solutions ?? [], submission, settings, stats0);

  const resolve = () =>
    resolveSolutionTarget({
      submission,
      solutions,
      codeHash: hash,
      rawHash,
      legacyHashes: stats0.contentHashes,
      fingerprint: fp,
      analysis,
      mode,
    });
  let target = resolve();
  let hydrated = false;
  if (target.kind !== 'duplicate' && solutions.some(needsHydration)) {
    await updateSyncState({ status: 'syncing', error: null, detail: 'Comparing with saved solutions…' });
    solutions = await hydrateSolutions(token, settings, solutions);
    hydrated = true;
    target = resolve();
  }

  if (target.kind === 'duplicate' && !force) {
    if (hydrated && before) {
      const { solutions: classified, bestKey } = classifySolutions(solutions);
      await setProblemEntry(submission.number, {
        ...before,
        solutions: classified,
        ...(bestKey ? { bestKey } : {}),
      });
    }
    // No re-commit needed, but still count today toward the streak and surface
    // THIS problem in the popup so the user gets confirmation it's in sync.
    const touched = touchStreakForActivity(stats0);
    await setStats({
      ...touched,
      lastSynced: {
        number: submission.number,
        title: submission.title,
        difficulty: submission.difficulty,
        language: submission.language,
        // Use the original sync time so "x ago" stays truthful.
        syncedAt: target.solution.syncedAt || submission.submittedAt,
        url: stats0.lastSynced?.url,
      },
    });
    await updateSyncState({
      status: 'idle',
      error: null,
      detail:
        touched.streak.current !== stats0.streak.current
          ? `Already saved as ${displayLabel(target.solution)} — streak ${touched.streak.current}`
          : `Already saved as ${displayLabel(target.solution)} — no code changes`,
    });
    if (submission.leetcodeSubmissionId) {
      await markSubmissionSeen(submission.titleSlug, submission.leetcodeSubmissionId);
    }
    await releaseSlot();
    return { ok: true, outcome: 'duplicate', solutionKey: target.solution.key };
  }

  await updateSyncState({ status: 'syncing', error: null, detail: null });

  let key: string;
  let approach: string | undefined;
  let path: string;
  if (target.kind === 'new') {
    key = target.key;
    approach = target.approach;
    path = buildSolutionPath(settings, { ...submission, approach }, solutions);
  } else {
    ({ key, approach, path } = target.solution);
  }

  const stamped: Submission = { ...submission, key, analysis };
  if (approach) stamped.approach = approach;
  else delete stamped.approach;

  const content = buildFileContent(settings, stamped);
  const message = renderCommitMessage(settings.commitMessageTemplate, stamped);

  try {
    const result = await withRetry(
      () =>
        commitFile({
          token,
          owner: username,
          repo,
          branch,
          path,
          content,
          message,
        }),
      {
        retries: 2,
        // Only retry transient network failures; auth/not_found/etc. are fatal.
        shouldRetry: (err) =>
          err instanceof GitHubApiError && err.kind === 'network',
      },
    );

    const url = result.content?.html_url ?? result.commit?.html_url;
    const stats = applySync(stats0, stamped, url, rawHash);
    await setStats(stats);

    const index = await updateProblemIndex(
      stamped,
      { key, approach, path, codeHash: hash, fingerprint: fp, analysis },
      { appendNotes, baseSolutions: solutions },
    );
    const after = index[submission.number];
    const saved = after?.solutions?.find((s) => s.key === key);
    await releaseSlot();

    // Best-effort README updates — never fail the sync because of them.
    if (after) {
      try {
        await commitProblemReadmes(token, settings, before, after, key);
        await commitProgressReadme(token, settings, stats, index);
      } catch (err) {
        console.warn('[LeetCode Sync] README update failed', err);
      }
    }

    if (submission.leetcodeSubmissionId) {
      await markSubmissionSeen(submission.titleSlug, submission.leetcodeSubmissionId);
    }

    const detail = slot ? `Saved to "${slot.label}" (${slot.approach}/)` : describe(target.kind, saved, after);
    await updateSyncState({ status: 'success', error: null, detail });

    if (notifyUser) {
      notify('Synced to GitHub', `#${submission.number} ${submission.title} (${submission.language}) — ${detail}`);
    }
    return {
      ok: true,
      lastSynced: stats.lastSynced ?? undefined,
      solutionKey: key,
      outcome: target.kind === 'duplicate' || target.kind === 'update' ? 'updated' : target.kind,
      ...(slot ? { slotLabel: slot.label } : {}),
    };
  } catch (err) {
    const error = friendlyMessage(err);
    await updateSyncState({ status: 'error', error });
    if (notifyUser) notify('Sync failed', error);
    return { ok: false, error };
  }
}
