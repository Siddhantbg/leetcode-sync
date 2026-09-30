import {
  getProblemIndex,
  getProblemSlots,
  getSettings,
  getStats,
  getToken,
  setProblemEntry,
} from '@/storage';
import { commitFile, deleteFile, friendlyMessage, getFileContent } from '@/github';
import type {
  SolutionApproach,
  SolvedProblem,
  Submission,
  SyncResult,
  UpdateSolutionMessage,
} from '@/types';
import { stripSyncHeader } from '@/utils/analysis';
import { displayLabel } from '@/utils/classify';
import { buildFileContent } from '@/utils/content';
import { dirOf } from '@/utils/path';
import {
  applyRename,
  applySolutionEdit,
  normalizeProblemEntry,
  planRename,
  renameConflict,
} from '@/utils/solution';
import { commitProblemReadmes, commitProgressReadme } from './readmes';
import { updateSyncState } from './state';

/** Rebuild a Submission-shaped object for re-rendering a solution file header. */
function submissionFor(p: SolvedProblem, s: SolutionApproach, code: string): Submission {
  const ext = s.path.split('.').pop() ?? 'txt';
  const userTime = s.timeComplexity !== s.analysis?.timeComplexity ? s.timeComplexity : undefined;
  const userSpace = s.spaceComplexity !== s.analysis?.spaceComplexity ? s.spaceComplexity : undefined;
  return {
    key: s.key,
    number: p.number,
    title: p.title,
    titleSlug: p.titleSlug,
    difficulty: p.difficulty,
    language: s.language,
    languageExt: ext,
    code,
    submittedAt: s.createdAt ?? s.syncedAt,
    runtime: s.runtime,
    memory: s.memory,
    url: p.url,
    notes: s.notes,
    timeComplexity: userTime,
    spaceComplexity: userSpace,
    analysis: s.analysis,
    ...(s.approach ? { approach: s.approach } : {}),
  };
}

/**
 * Edit a saved solution's label / complexity / notes from the popup.
 *
 * Giving a solution a new name moves it on GitHub to `<Problem>/<name>/`
 * (file + its README); the old file and folder README are deleted. Clearing
 * the name reverts to the automatic label without moving anything. The index,
 * classification, READMEs and (with "include notes") the file header follow.
 */
export async function updateSolution(msg: UpdateSolutionMessage): Promise<SyncResult> {
  const index = await getProblemIndex();
  const stored = index[msg.problemNumber];
  if (!stored) return { ok: false, error: 'Problem not found. Sync it once first.' };

  const before = normalizeProblemEntry(stored);
  let after = applySolutionEdit(before, msg.key, {
    label: msg.label,
    timeComplexity: msg.timeComplexity,
    spaceComplexity: msg.spaceComplexity,
    notes: msg.notes,
    appendNotes: msg.appendNotes,
  });
  if (!after) return { ok: false, error: 'Solution not found.' };

  const [token, settings] = await Promise.all([getToken(), getSettings()]);
  const { username: owner, repo, branch } = settings.github;
  const connected = Boolean(token && owner && repo);

  const prior = before.solutions?.find((s) => s.key === msg.key);
  const newLabel = msg.label?.trim();
  const renamed = Boolean(newLabel) && !(prior?.labelSource === 'user' && prior.label === newLabel);
  const plan = renamed ? planRename(after, msg.key, newLabel!, settings.perProblemFolder) : null;
  if (plan) {
    const pending = (await getProblemSlots(msg.problemNumber)).slots.map((s) => s.approach);
    const conflict = renameConflict(after, msg.key, plan, pending);
    if (conflict) return { ok: false, error: conflict };
    if (!connected) return { ok: false, error: 'Connect GitHub to rename the solution folder.' };
  } else {
    await setProblemEntry(msg.problemNumber, after);
    if (!connected) {
      return { ok: true, solutionKey: msg.key, error: 'Saved locally — connect GitHub to update READMEs.' };
    }
  }

  await updateSyncState({ status: 'syncing', error: null, detail: plan ? 'Renaming folder…' : null });
  try {
    const annotated =
      msg.notes !== undefined || msg.timeComplexity !== undefined || msg.spaceComplexity !== undefined;
    if (plan) {
      const file = await getFileContent(token!, owner, repo, plan.from, branch);
      if (!file) {
        const error = `Couldn't find ${plan.from} on GitHub — Force sync this solution first.`;
        await updateSyncState({ status: 'error', error });
        return { ok: false, error };
      }
      after = applyRename(after, msg.key, plan);
      const moved = after.solutions!.find((s) => s.key === msg.key)!;
      const content = settings.includeNotes
        ? buildFileContent(settings, submissionFor(after, moved, stripSyncHeader(file.content)))
        : file.content;
      const message = `Rename #${after.number} ${after.title}: ${prior ? displayLabel(prior) : 'solution'} → ${displayLabel(moved)}`;

      await commitFile({ token: token!, owner, repo, branch, path: plan.to, content, message });
      await setProblemEntry(msg.problemNumber, after);
      await deleteFile({ token: token!, owner, repo, branch, path: plan.from, message });
      if (prior?.approach) {
        // The old solution folder is now empty apart from its README.
        await deleteFile({
          token: token!, owner, repo, branch,
          path: [...dirOf(plan.from), 'README.md'].join('/'),
          message,
        });
      }
    } else if (settings.includeNotes && annotated) {
      const solution = after.solutions?.find((s) => s.key === msg.key);
      const file = solution ? await getFileContent(token!, owner, repo, solution.path, branch) : null;
      if (solution && file) {
        const content = buildFileContent(settings, submissionFor(after, solution, stripSyncHeader(file.content)));
        if (content !== file.content) {
          await commitFile({
            token: token!, owner, repo, branch,
            path: solution.path,
            content,
            message: `docs: #${after.number} ${after.title} notes & complexity`,
          });
        }
      }
    }

    await commitProblemReadmes(token!, settings, before, after, msg.key);
    const [stats, fresh] = await Promise.all([getStats(), getProblemIndex()]);
    await commitProgressReadme(token!, settings, stats, fresh);

    const solution = after.solutions?.find((s) => s.key === msg.key);
    const label = solution ? displayLabel(solution) : 'solution';
    const detail = plan ? `Renamed to ${label} — moved to ${plan.approach}/` : `Updated ${label}`;
    await updateSyncState({ status: 'success', error: null, detail });
    return { ok: true, solutionKey: msg.key, detail };
  } catch (err) {
    const error = friendlyMessage(err);
    await updateSyncState({ status: 'error', error });
    return { ok: false, error };
  }
}
