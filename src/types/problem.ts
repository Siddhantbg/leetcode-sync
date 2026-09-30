import type { Difficulty } from './submission';

/** Who assigned a solution's label. User labels are never overwritten. */
export type SolutionLabelSource = 'auto' | 'user';

/** Result of static analysis of a solution's source code (best-effort). */
export interface SolutionAnalysis {
  /** Only set when the analyzer is reasonably confident. */
  timeComplexity?: string;
  spaceComplexity?: string;
  /** Human-readable algorithm/pattern, e.g. "Hash map" or "Reverse traversal". */
  pattern?: string;
  style?: 'recursive' | 'iterative';
  /** Analyzer version, so improved heuristics can re-run on old entries. */
  version: number;
}

/**
 * One synced solution for a problem+language.
 *
 * Identity is the code (`id` / `codeHash`), not the human-readable label:
 * `label` is classification metadata that can change as more solutions arrive,
 * while `key`, `approach` (folder slug) and `path` never change once assigned.
 */
export interface SolutionApproach {
  /**
   * Storage / dedupe key (also in stats.syncedKeys).
   *   primary:     "1-python3"
   *   additional:  "1-python3-solution-2"
   *   legacy name: "1-python3-hashmap"
   */
  key: string;
  language: string;
  /**
   * Folder slug for non-primary solutions ("solution-2", or a legacy
   * user-chosen name like "brute-force"). Undefined = primary solution.
   */
  approach?: string;
  path: string;
  syncedAt: number;
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;

  /** Stable identity: `${number}-${language}-${codeHash of first revision}`. */
  id?: string;
  /** Hash of the whitespace-normalized source of the latest revision. */
  codeHash?: string;
  /** MinHash signature of the code's token shingles (near-duplicate detection). */
  fingerprint?: string;
  /** Epoch ms when this solution was first saved. */
  createdAt?: number;
  /** Number of in-place revisions (near-identical resubmissions) after the first. */
  revisions?: number;

  /** Display label, e.g. "Optimal", "Brute Force", "Solution 2". */
  label?: string;
  labelSource?: SolutionLabelSource;
  analysis?: SolutionAnalysis;

  runtime?: string;
  memory?: string;
  leetcodeSubmissionId?: string;
}

/** One solved problem, accumulated for README generation. */
export interface SolvedProblem {
  number: number;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  /** Languages the problem has been solved in (deduped). */
  languages: string[];
  /** LeetCode problem URL. */
  url: string;
  /** Repository-relative path of the (most recent) default solution file. */
  path: string;
  /** Epoch ms of the latest sync for this problem. */
  syncedAt: number;

  /** Best-effort runtime/memory from the latest submission. */
  runtime?: string;
  memory?: string;

  /**
   * Annotations for the default (unnamed) approach — kept for backward
   * compatibility with older indexes / READMEs.
   */
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;

  /** Every saved solution (primary + additional), across languages. */
  solutions?: SolutionApproach[];

  /**
   * Key of the objectively best solution (by asymptotic complexity). Unset
   * when that can't be determined reliably.
   */
  bestKey?: string;
}

/** Identifies a LeetCode problem (known even before any accepted submission). */
export interface ProblemRef {
  number: number;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
}

/**
 * A named solution the user created in the popup that hasn't been filled yet.
 * While armed, the next accepted submission for the problem is saved into
 * `<Problem>/<approach>/` with this label, notes and complexity.
 */
export interface SolutionSlot {
  id: string;
  label: string;
  /** Folder slug derived from the label, e.g. "brute-force". */
  approach: string;
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  createdAt: number;
}

export interface ProblemSlots {
  slots: SolutionSlot[];
  /** Slot that receives the next accepted submission (selected in the popup). */
  armedId?: string;
}

/** Pending solution slots keyed by problem number. */
export type SolutionSlots = Record<number, ProblemSlots>;

/**
 * Index of solved problems keyed by frontend number. Serialized to JSON, so
 * keys become strings — iterate with Object.values().
 */
export type ProblemIndex = Record<number, SolvedProblem>;
