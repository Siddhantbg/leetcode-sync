/**
 * Solution identity and index bookkeeping (pure functions, no chrome.* / I/O).
 *
 * Model: Submission → Solution (identified by problem + language + code) →
 * Analysis → Classification label → file/README presentation. The label is
 * never part of the identity, so reclassifying never moves files.
 */
import type {
  SolutionAnalysis,
  SolutionApproach,
  SolvedProblem,
  Submission,
} from '@/types';
import { languageFamily, stripCommentsAndStrings, stripSyncHeader } from './analysis';
import { sanitizeApproach, submissionKey } from './approach';
import {
  classifySolutions,
  complexityRank,
  isAutoSlug,
  prettifyApproach,
} from './classify';
import { hashString } from './hash';
import { languageToExt } from './language';
import { problemReadmeDir } from './path';

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/** Line endings, trailing whitespace and a sync header don't change identity. */
export function normalizeCode(code: string): string {
  return stripSyncHeader(code)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

export function codeHash(code: string): string {
  return hashString(normalizeCode(code));
}

const MINHASH_SIZE = 32;
const SHINGLE = 3;
const SEEDS = Array.from({ length: MINHASH_SIZE }, (_, k) => Math.imul(k + 1, 0x9e3779b1) >>> 0);

function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * MinHash signature over token 3-grams (comments/strings ignored). Two
 * signatures estimate the Jaccard similarity of the underlying code.
 */
export function fingerprint(code: string, language: string): string {
  const family = languageFamily(language);
  const normalized = normalizeCode(code);
  const src = family ? stripCommentsAndStrings(normalized, family) : normalized;
  const tokens = src.match(/[A-Za-z_]\w*|\d+|[^\s\w]/g) ?? [];
  const shingles = new Set<string>();
  if (tokens.length < SHINGLE) shingles.add(tokens.join(' '));
  for (let i = 0; i + SHINGLE <= tokens.length; i++) {
    shingles.add(tokens.slice(i, i + SHINGLE).join(' '));
  }
  const mins = new Array<number>(MINHASH_SIZE).fill(0xffffffff);
  for (const sh of shingles) {
    const base = parseInt(hashString(sh), 16);
    for (let k = 0; k < MINHASH_SIZE; k++) {
      const h = mix(base ^ SEEDS[k]!);
      if (h < mins[k]!) mins[k] = h;
    }
  }
  return mins.map((h) => h.toString(16).padStart(8, '0')).join('');
}

/** Estimated Jaccard similarity (0..1) of two fingerprints. */
export function similarity(a: string | undefined, b: string | undefined): number {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  const n = a.length / 8;
  for (let i = 0; i < n; i++) {
    if (a.slice(i * 8, i * 8 + 8) === b.slice(i * 8, i * 8 + 8)) same++;
  }
  return same / n;
}

/**
 * Near-identical resubmissions (comment edits, a changed comparison, a renamed
 * helper) update the existing solution instead of creating a new version.
 * Kept high: a missed merge only costs an extra version, a wrong merge hides one.
 */
export const REVISION_THRESHOLD = 0.9;

/* ------------------------------------------------------------------ */
/* Target resolution                                                   */
/* ------------------------------------------------------------------ */

export type SolutionTarget =
  | { kind: 'duplicate'; solution: SolutionApproach }
  | { kind: 'revision'; solution: SolutionApproach; similarity: number }
  | { kind: 'update'; solution: SolutionApproach }
  | { kind: 'new'; key: string; approach?: string };

export interface ResolveInput {
  submission: Submission;
  /** All known solutions for the problem (any language). */
  solutions: SolutionApproach[];
  codeHash: string;
  /** Hash of the raw code, as stored in legacy stats.contentHashes. */
  rawHash: string;
  /** stats.contentHashes (legacy per-key hashes). */
  legacyHashes: Record<string, string>;
  fingerprint: string;
  analysis: SolutionAnalysis;
  /** "new" skips revision merging (manual "Add solution"). */
  mode?: 'auto' | 'new';
}

export function matchesCode(
  s: SolutionApproach,
  hash: string,
  rawHash: string,
  legacyHashes: Record<string, string>,
): boolean {
  if (s.codeHash) return s.codeHash === hash;
  const legacy = legacyHashes[s.key];
  return legacy != null && (legacy === rawHash || legacy === hash);
}

/** Different known complexity or style means a different approach, not a revision. */
function compatible(s: SolutionApproach, analysis: SolutionAnalysis): boolean {
  const a = s.analysis;
  if (!a) return true;
  if (a.timeComplexity && analysis.timeComplexity && a.timeComplexity !== analysis.timeComplexity) return false;
  if (a.spaceComplexity && analysis.spaceComplexity && a.spaceComplexity !== analysis.spaceComplexity) return false;
  if (a.style && analysis.style && a.style !== analysis.style) return false;
  return true;
}

export function nextSolutionSlug(sameLanguage: SolutionApproach[]): string {
  const used = new Set(sameLanguage.map((s) => s.approach));
  let n = Math.max(2, sameLanguage.length + 1);
  while (used.has(`solution-${n}`)) n++;
  return `solution-${n}`;
}

/**
 * Decide where an accepted submission goes:
 *   duplicate — exact same code already saved (skip unless forced)
 *   revision  — near-identical to an existing solution (update it in place)
 *   update    — explicitly targeted existing solution (legacy named approach)
 *   new       — first solution (primary) or a genuinely different one
 */
export function resolveSolutionTarget(input: ResolveInput): SolutionTarget {
  const { submission: sub, codeHash: hash, rawHash, legacyHashes } = input;
  const sameLanguage = input.solutions.filter((s) => s.language === sub.language);

  const explicit = sanitizeApproach(sub.approach);
  if (explicit) {
    const key = submissionKey(sub.number, sub.language, explicit);
    const existing = sameLanguage.find((s) => s.key === key);
    if (existing) {
      return matchesCode(existing, hash, rawHash, legacyHashes)
        ? { kind: 'duplicate', solution: existing }
        : { kind: 'update', solution: existing };
    }
    return { kind: 'new', key, approach: explicit };
  }

  const exact = sameLanguage.find((s) => matchesCode(s, hash, rawHash, legacyHashes));
  if (exact) return { kind: 'duplicate', solution: exact };

  if (sameLanguage.length === 0) {
    return { kind: 'new', key: submissionKey(sub.number, sub.language) };
  }

  if (input.mode !== 'new') {
    let best: { solution: SolutionApproach; similarity: number } | null = null;
    for (const s of sameLanguage) {
      const sim = similarity(s.fingerprint, input.fingerprint);
      if (sim >= REVISION_THRESHOLD && compatible(s, input.analysis) && (!best || sim > best.similarity)) {
        best = { solution: s, similarity: sim };
      }
    }
    if (best) return { kind: 'revision', ...best };
  }

  const approach = nextSolutionSlug(sameLanguage);
  return { kind: 'new', key: submissionKey(sub.number, sub.language, approach), approach };
}

/* ------------------------------------------------------------------ */
/* Legacy upgrade                                                      */
/* ------------------------------------------------------------------ */

function upgradeSolution(s: SolutionApproach): SolutionApproach {
  const user = s.labelSource
    ? s.labelSource === 'user'
    : Boolean(s.approach && !isAutoSlug(s.approach));
  return {
    ...s,
    id: s.id ?? s.key,
    createdAt: s.createdAt ?? s.syncedAt,
    labelSource: user ? 'user' : 'auto',
    ...(user && !s.label && s.approach ? { label: prettifyApproach(s.approach) } : {}),
  };
}

/**
 * Bring an index entry written by an older version up to the current model:
 *  - entries without solutions[] get a primary synthesized from top-level fields,
 *  - legacy named approaches ("brute-force") become user-labelled solutions.
 * Idempotent.
 */
export function normalizeProblemEntry(
  entry: SolvedProblem,
  fallbackLanguage?: string,
): SolvedProblem {
  if (entry.solutions && entry.solutions.length > 0) {
    return { ...entry, solutions: entry.solutions.map(upgradeSolution) };
  }
  if (!entry.path) return { ...entry, solutions: [] };

  const language =
    entry.languages.find((l) => entry.path.endsWith(`.${languageToExt(l)}`)) ??
    entry.languages[0] ??
    fallbackLanguage;
  if (!language) return { ...entry, solutions: [] };

  const primary: SolutionApproach = {
    key: submissionKey(entry.number, language),
    language,
    path: entry.path,
    syncedAt: entry.syncedAt,
    notes: entry.notes,
    timeComplexity: entry.timeComplexity,
    spaceComplexity: entry.spaceComplexity,
  };
  return { ...entry, solutions: [upgradeSolution(primary)] };
}

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

/**
 * Effective complexity: explicit user input wins, then a previously
 * user-entered value (one that differs from the old auto value), then the
 * fresh analysis. Without a fresh analysis the prior value is kept.
 */
export function effectiveComplexity(
  userValue: string | undefined,
  prior: string | undefined,
  priorAuto: string | undefined,
  freshAuto: string | undefined,
  analyzed: boolean,
): string | undefined {
  const explicit = userValue?.trim();
  if (explicit) return explicit;
  if (prior && prior !== priorAuto) return prior;
  return analyzed ? freshAuto : prior;
}

export function mergeNotes(
  incoming: string | undefined,
  prior: string | undefined,
  append: boolean,
): string | undefined {
  const next = incoming?.trim();
  if (!next) return prior;
  const prev = prior?.trim();
  if (!prev) return next;
  if (append) return prev.includes(next) ? prev : `${prev}\n\n${next}`;
  return next;
}

export interface SolutionWrite {
  key: string;
  approach?: string;
  path: string;
  codeHash: string;
  fingerprint: string;
  analysis?: SolutionAnalysis;
}

export interface MergeOptions {
  appendNotes?: boolean;
  /** Pre-resolved (possibly hydrated) solutions to use instead of the entry's. */
  baseSolutions?: SolutionApproach[];
  now?: number;
}

/**
 * Record a synced submission in its problem entry, then reclassify. Top-level
 * annotations stay tied to the primary (unnamed) solution for compatibility.
 */
export function mergeSolutionIntoEntry(
  existing: SolvedProblem | undefined,
  submission: Submission,
  write: SolutionWrite,
  options: MergeOptions = {},
): SolvedProblem {
  const now = options.now ?? Date.now();
  const base = existing ? normalizeProblemEntry(existing, submission.language) : undefined;
  const solutions = [...(options.baseSolutions ?? base?.solutions ?? [])].map(upgradeSolution);
  const idx = solutions.findIndex((s) => s.key === write.key);
  const prior = idx >= 0 ? solutions[idx] : undefined;
  const analyzed = write.analysis != null;
  const label = submission.label?.trim();

  const codeChanged = Boolean(prior?.codeHash && prior.codeHash !== write.codeHash);
  const next: SolutionApproach = {
    ...prior,
    key: write.key,
    language: submission.language,
    path: write.path,
    syncedAt: now,
    createdAt: prior?.createdAt ?? now,
    id:
      prior?.id && prior.id !== prior.key
        ? prior.id
        : `${submission.number}-${submission.language}-${write.codeHash}`,
    codeHash: write.codeHash,
    fingerprint: write.fingerprint,
    analysis: write.analysis ?? prior?.analysis,
    revisions: codeChanged ? (prior?.revisions ?? 0) + 1 : (prior?.revisions ?? 0),
    notes: mergeNotes(submission.notes, prior?.notes, options.appendNotes ?? false),
    timeComplexity: effectiveComplexity(
      submission.timeComplexity, prior?.timeComplexity, prior?.analysis?.timeComplexity,
      write.analysis?.timeComplexity, analyzed,
    ),
    spaceComplexity: effectiveComplexity(
      submission.spaceComplexity, prior?.spaceComplexity, prior?.analysis?.spaceComplexity,
      write.analysis?.spaceComplexity, analyzed,
    ),
    runtime: submission.runtime ?? prior?.runtime,
    memory: submission.memory ?? prior?.memory,
    leetcodeSubmissionId: submission.leetcodeSubmissionId ?? prior?.leetcodeSubmissionId,
    labelSource: label ? 'user' : (prior?.labelSource ?? 'auto'),
    label: label || prior?.label,
  };
  const approach = write.approach ?? prior?.approach;
  if (approach) next.approach = approach;
  else delete next.approach;

  if (idx >= 0) solutions[idx] = next;
  else solutions.push(next);

  const { solutions: classified, bestKey } = classifySolutions(solutions);
  // A renamed primary lives in a named folder but still owns the top-level fields.
  const isPrimary = !next.approach || (prior != null && prior.path === base?.path);
  const languages = Array.from(new Set([...(base?.languages ?? []), submission.language]));

  const entry: SolvedProblem = {
    number: submission.number,
    title: submission.title,
    titleSlug: submission.titleSlug,
    difficulty: submission.difficulty,
    languages,
    url: submission.url ?? base?.url ?? `https://leetcode.com/problems/${submission.titleSlug}/`,
    path: isPrimary || !base?.path ? write.path : base.path,
    syncedAt: now,
    runtime: submission.runtime ?? base?.runtime,
    memory: submission.memory ?? base?.memory,
    notes: isPrimary ? next.notes : base?.notes,
    timeComplexity: isPrimary ? next.timeComplexity : base?.timeComplexity,
    spaceComplexity: isPrimary ? next.spaceComplexity : base?.spaceComplexity,
    solutions: classified,
  };
  if (bestKey) entry.bestKey = bestKey;
  return entry;
}

export interface SolutionEdit {
  /** New label; empty string reverts to the automatic label. */
  label?: string;
  /** Empty string reverts to the auto-detected value. */
  timeComplexity?: string;
  spaceComplexity?: string;
  notes?: string;
  appendNotes?: boolean;
}

/** Apply a popup edit to one solution and reclassify. Returns null if not found. */
export function applySolutionEdit(
  entry: SolvedProblem,
  key: string,
  edit: SolutionEdit,
): SolvedProblem | null {
  const normalized = normalizeProblemEntry(entry);
  const solutions = [...(normalized.solutions ?? [])];
  const idx = solutions.findIndex((s) => s.key === key);
  if (idx < 0) return null;
  const s = { ...solutions[idx]! };

  if (edit.label !== undefined) {
    const label = edit.label.trim();
    if (label) {
      s.label = label;
      s.labelSource = 'user';
    } else {
      s.labelSource = 'auto';
      delete s.label;
    }
  }
  const complexity = (value: string | undefined, auto: string | undefined, current: string | undefined) => {
    if (value === undefined) return current;
    return value.trim() || auto;
  };
  s.timeComplexity = complexity(edit.timeComplexity, s.analysis?.timeComplexity, s.timeComplexity);
  s.spaceComplexity = complexity(edit.spaceComplexity, s.analysis?.spaceComplexity, s.spaceComplexity);
  if (edit.notes !== undefined) {
    s.notes = edit.notes.trim()
      ? mergeNotes(edit.notes, s.notes, edit.appendNotes ?? false)
      : edit.appendNotes ? s.notes : undefined;
  }
  solutions[idx] = s;

  const { solutions: classified, bestKey } = classifySolutions(solutions);
  const next: SolvedProblem = { ...normalized, solutions: classified };
  if (bestKey) next.bestKey = bestKey;
  else delete next.bestKey;
  if (!s.approach || s.path === normalized.path) {
    next.notes = s.notes;
    next.timeComplexity = s.timeComplexity;
    next.spaceComplexity = s.spaceComplexity;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Renaming (moves the solution's folder)                              */
/* ------------------------------------------------------------------ */

export interface RenamePlan {
  approach: string;
  from: string;
  to: string;
}

/**
 * Where a renamed solution moves: `<Problem>/<slug>/<same file name>`.
 * Null when no move is needed (same folder name, or the name has no usable
 * characters).
 */
export function planRename(
  entry: SolvedProblem,
  key: string,
  label: string,
  perProblemFolder: boolean,
): RenamePlan | null {
  const solutions = entry.solutions ?? [];
  const s = solutions.find((x) => x.key === key);
  const approach = sanitizeApproach(label);
  if (!s || !approach || approach === s.approach) return null;
  const dir = problemReadmeDir(solutions, entry.title, perProblemFolder);
  if (!dir) return null;
  const file = s.path.split('/').pop() ?? s.path;
  return { approach, from: s.path, to: [...dir, approach, file].join('/') };
}

/** Why the rename can't happen (folder already used), or null. */
export function renameConflict(
  entry: SolvedProblem,
  key: string,
  plan: RenamePlan,
  pendingApproaches: string[] = [],
): string | null {
  const others = (entry.solutions ?? []).filter((s) => s.key !== key);
  if (others.some((s) => s.approach === plan.approach || s.path === plan.to) || pendingApproaches.includes(plan.approach)) {
    return `A solution folder "${plan.approach}" already exists — pick another name.`;
  }
  return null;
}

/** Record a moved solution in the entry (identity/key unchanged). */
export function applyRename(entry: SolvedProblem, key: string, plan: RenamePlan): SolvedProblem {
  return {
    ...entry,
    path: entry.path === plan.from ? plan.to : entry.path,
    solutions: (entry.solutions ?? []).map((s) =>
      s.key === key ? { ...s, approach: plan.approach, path: plan.to } : s,
    ),
  };
}

/** Solutions ordered for display: best first, then by time rank, then age. */
export function orderForDisplay(entry: SolvedProblem): SolutionApproach[] {
  const best = (s: SolutionApproach) => (s.key === entry.bestKey ? 0 : 1);
  const time = (s: SolutionApproach) => complexityRank(s.timeComplexity) ?? Infinity;
  const age = (s: SolutionApproach) => s.createdAt ?? s.syncedAt;
  return [...(entry.solutions ?? [])].sort(
    (a, b) => best(a) - best(b) || time(a) - time(b) || age(a) - age(b),
  );
}
