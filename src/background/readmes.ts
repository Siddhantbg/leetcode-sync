import { commitFile } from '@/github';
import type {
  ProblemIndex,
  Settings,
  SolutionApproach,
  SolvedProblem,
  Stats,
} from '@/types';
import { displayLabel } from '@/utils/classify';
import { dirOf, problemReadmeDir } from '@/utils/path';
import {
  buildApproachReadme,
  buildProblemReadme,
  buildReadme,
} from '@/utils/readme';

/**
 * Solutions whose README content may have changed: the one just touched, new
 * ones, and any whose label / best status / complexity changed through
 * reclassification.
 */
export function changedSolutions(
  before: SolvedProblem | undefined,
  after: SolvedProblem,
  touchedKey?: string,
): SolutionApproach[] {
  const prev = new Map((before?.solutions ?? []).map((s) => [s.key, s]));
  return (after.solutions ?? []).filter((s) => {
    if (s.key === touchedKey) return true;
    const p = prev.get(s.key);
    if (!p) return true;
    return (
      p.label !== s.label ||
      (before?.bestKey === s.key) !== (after.bestKey === s.key) ||
      p.timeComplexity !== s.timeComplexity ||
      p.spaceComplexity !== s.spaceComplexity
    );
  });
}

/**
 * Commit per-problem READMEs:
 *  - a README beside each changed solution that lives in its own folder
 *    (Problem/solution-2/README.md, or Problem/README.md for a lone primary
 *    with "one folder per problem"),
 *  - the problem-level index README when the problem has several solutions.
 * Flat single-solution layouts get no per-problem README (unchanged behavior).
 */
export async function commitProblemReadmes(
  token: string,
  settings: Settings,
  before: SolvedProblem | undefined,
  after: SolvedProblem,
  touchedKey?: string,
): Promise<void> {
  const solutions = after.solutions ?? [];
  const multiple = solutions.length > 1;
  if (!settings.perProblemFolder && !solutions.some((s) => s.approach)) return;

  const { username: owner, repo, branch } = settings.github;
  const commit = (path: string, content: string, message: string) =>
    commitFile({ token, owner, repo, branch, path, content, message });

  for (const s of changedSolutions(before, after, touchedKey)) {
    const ownFolder = s.approach != null || (!multiple && settings.perProblemFolder);
    if (!ownFolder) continue;
    await commit(
      [...dirOf(s.path), 'README.md'].join('/'),
      buildApproachReadme(after, s),
      `docs: ${after.title} [${displayLabel(s)}] notes & complexity`,
    );
  }

  const dir = problemReadmeDir(solutions, after.title, settings.perProblemFolder);
  const lone = solutions.length === 1 ? solutions[0] : undefined;
  const loneInSubfolder = Boolean(lone?.approach && dir && dir.join('/') !== dirOf(lone.path).join('/'));
  if (dir && (multiple || loneInSubfolder)) {
    await commit(
      [...dir, 'README.md'].join('/'),
      buildProblemReadme(after, dir),
      `docs: ${after.title} solutions index`,
    );
  }
}

/** Commit the global progress README (when enabled in settings). */
export async function commitProgressReadme(
  token: string,
  settings: Settings,
  stats: Stats,
  index: ProblemIndex,
): Promise<void> {
  if (!settings.includeReadme) return;
  const { username: owner, repo, branch } = settings.github;
  await commitFile({
    token,
    owner,
    repo,
    branch,
    path: settings.rootFolder ? `${settings.rootFolder}/README.md` : 'README.md',
    content: buildReadme(settings, stats, index),
    message: 'docs: update LeetCode progress',
  });
}
