import type { Settings, SolutionApproach, Submission } from '@/types';
import { sanitizeApproach } from './approach';

/** Strip characters that are illegal in file paths and collapse whitespace. */
function sanitizeSegment(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSnake(name: string): string {
  return sanitizeSegment(name).replace(/\s+/g, '_');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

export interface PathOptions {
  /**
   * Existing repo path for this problem (from the local index). When set, its
   * problem-folder prefix is reused so re-syncs don't create a second folder
   * after folder-naming rules change (e.g. title-only → "162. Title").
   */
  existingPath?: string;
}

/**
 * Infer the problem directory (no approach segment, no filename) from a
 * previously synced solution path.
 */
function problemDirFromExistingPath(
  existingPath: string,
  approach?: string,
): string[] | null {
  const segments = existingPath.split('/').filter(Boolean);
  if (segments.length < 1) return null;
  segments.pop(); // filename
  if (approach && segments[segments.length - 1] === approach) {
    segments.pop();
  }
  return segments.length > 0 ? segments : null;
}

/**
 * Directory for the problem itself (no approach subfolder).
 * Named approaches always force a per-problem folder so each approach can
 * live under Problem/<approach>/...
 *
 * Already-synced problems keep their existing folder via PathOptions.existingPath
 * when folder naming rules change later.
 */
export function problemDirParts(
  settings: Settings,
  s: Submission,
  opts: PathOptions = {},
): string[] {
  const approach = sanitizeApproach(s.approach);
  if (opts.existingPath) {
    const reused = problemDirFromExistingPath(opts.existingPath, approach || undefined);
    if (reused) return reused;
  }

  const parts: string[] = [];

  const root = sanitizeSegment(settings.rootFolder);
  if (root) parts.push(root);

  if (settings.folderNaming === 'by-difficulty') {
    parts.push(s.difficulty);
  }

  if (settings.perProblemFolder || approach) {
    // Title alone is usually unique; problem number is always in the filename
    // and README. Force Sync also binds notes to the active tab's number/slug
    // so near-identical titles (Peak Element vs Peak Element II) cannot mix.
    parts.push(sanitizeSegment(s.title));
  }

  return parts;
}

/** Directory (without filename) for a submission's solution. */
function dirParts(
  settings: Settings,
  s: Submission,
  opts: PathOptions = {},
): string[] {
  const parts = problemDirParts(settings, s, opts);
  const approach = sanitizeApproach(s.approach);
  if (approach) parts.push(approach);
  return parts;
}

function fileName(settings: Settings, s: Submission): string {
  const ext = s.languageExt;
  // Approach lives in its own folder — keep the filename clean (no .approach suffix).
  return settings.fileNaming === 'padded-snake'
    ? `${pad4(s.number)}_${toSnake(s.title)}.${ext}`
    : `${s.number}. ${sanitizeSegment(s.title)}.${ext}`;
}

/**
 * Build the repository-relative file path for a submission.
 *
 *   default (no approach):
 *     "LeetCode/Easy/1. Two Sum.py"
 *     "LeetCode/Easy/Two Sum/1. Two Sum.py"   (perProblemFolder)
 *
 *   named approach (always under problem + approach folders):
 *     "LeetCode/Easy/Two Sum/brute-force/1. Two Sum.py"
 *     "LeetCode/Easy/Two Sum/optimal/1. Two Sum.py"
 *
 * Always uses forward slashes (required by the GitHub API).
 */
export function buildFilePath(
  settings: Settings,
  s: Submission,
  opts: PathOptions = {},
): string {
  return [...dirParts(settings, s, opts), fileName(settings, s)].join('/');
}

interface ProblemDir {
  parts: string[];
  /** True when `parts` ends in the problem's own folder. */
  titled: boolean;
}

/**
 * Locate a problem's folder from the paths of solutions already synced for it,
 * so new solutions land beside old ones even after naming settings change.
 */
export function problemDirFromSolutions(
  solutions: SolutionApproach[],
  title: string,
  perProblemFolder: boolean,
): ProblemDir | null {
  const named = solutions.find((s) => s.approach && s.path);
  if (named) {
    const segments = named.path.split('/').filter(Boolean);
    segments.pop();
    if (segments[segments.length - 1] === named.approach) segments.pop();
    return { parts: segments, titled: true };
  }
  const primary = solutions.find((s) => s.path);
  if (!primary) return null;
  const segments = primary.path.split('/').filter(Boolean);
  segments.pop();
  const last = (segments[segments.length - 1] ?? '').toLowerCase();
  const wanted = sanitizeSegment(title).toLowerCase();
  const titled = perProblemFolder || (wanted !== '' && last.endsWith(wanted));
  return { parts: segments, titled };
}

/**
 * Path for a solution that hasn't been synced before. The primary follows the
 * normal layout; additional solutions go to Problem/<approach>/<file>.
 */
export function buildSolutionPath(
  settings: Settings,
  s: Submission,
  siblings: SolutionApproach[],
): string {
  const found = problemDirFromSolutions(siblings, s.title, settings.perProblemFolder);
  if (!found) return buildFilePath(settings, s);

  const approach = sanitizeApproach(s.approach);
  const titledDir = found.titled
    ? found.parts
    : [...found.parts, sanitizeSegment(s.title)];
  let dir: string[];
  if (approach) dir = [...titledDir, approach];
  else if (settings.perProblemFolder) dir = titledDir;
  else dir = found.titled ? titledDir.slice(0, -1) : found.parts;
  return [...dir, fileName(settings, s)].join('/');
}

/** Folder that holds a problem's index README, from its saved solutions. */
export function problemReadmeDir(
  solutions: SolutionApproach[],
  title: string,
  perProblemFolder: boolean,
): string[] | null {
  const found = problemDirFromSolutions(solutions, title, perProblemFolder);
  if (!found) return null;
  return found.titled ? found.parts : [...found.parts, sanitizeSegment(title)];
}

/** Directory part of a repository path. */
export function dirOf(path: string): string[] {
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  return segments;
}
