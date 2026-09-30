import type { SolutionAnalysis } from './problem';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/**
 * A single accepted LeetCode submission, extracted by the content script and
 * sent to the background worker for upload.
 */
export interface Submission {
  /**
   * Storage key of the solution this submission is saved as. The parser sets
   * the primary key ("1-python3"); the background worker re-targets it to an
   * existing or new solution ("1-python3-solution-2") based on the code.
   */
  key: string;

  /** Frontend problem number shown to users, e.g. 1 for "Two Sum". */
  number: number;
  title: string;
  /** URL slug, e.g. "two-sum". */
  titleSlug: string;
  difficulty: Difficulty;

  /** LeetCode language identifier, e.g. "python3", "cpp", "java". */
  language: string;
  /** File extension for the language (without dot), e.g. "py". */
  languageExt: string;

  /** Raw source code of the accepted submission. */
  code: string;

  /** Epoch milliseconds when the submission was made. */
  submittedAt: number;

  /** LeetCode submission id (used to detect re-solves of the same problem). */
  leetcodeSubmissionId?: string;

  /** Optional metadata (best-effort, may be absent on UI changes). */
  runtime?: string;
  memory?: string;
  tags?: string[];
  url?: string;

  /** User annotations (added via the popup, attached on Force Sync). */
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;

  /**
   * Folder slug of the solution this submission is saved as. Undefined =
   * primary. Normally assigned automatically ("solution-2").
   */
  approach?: string;

  /** Display label requested by the user (manual "Add solution" only). */
  label?: string;

  /** Static analysis of `code`, filled in by the background worker. */
  analysis?: SolutionAnalysis;
}
