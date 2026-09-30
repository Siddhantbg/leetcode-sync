/**
 * User-configurable settings.
 *
 * NOTE: The GitHub Personal Access Token is intentionally NOT part of this
 * object. It is stored under a separate storage key so it can be read, rotated
 * and deleted independently of the rest of the configuration.
 */

/** How solution files are grouped into folders. */
export type FolderNaming =
  | 'by-difficulty' // LeetCode/Easy/..., LeetCode/Medium/..., LeetCode/Hard/...
  | 'flat'; //          LeetCode/...

/** How individual solution files are named. */
export type FileNaming =
  | 'number-title' //  "1. Two Sum.py"
  | 'padded-snake'; // "0001_Two_Sum.py"

export interface GitHubRepoSettings {
  /** GitHub account/owner that owns the target repository. */
  username: string;
  /** Repository name (without the owner). */
  repo: string;
  /** Branch to commit to, e.g. "main". */
  branch: string;
}

export interface Settings {
  github: GitHubRepoSettings;

  /** Top-level folder inside the repo, e.g. "LeetCode". Empty = repo root. */
  rootFolder: string;

  folderNaming: FolderNaming;
  fileNaming: FileNaming;

  /**
   * Put each problem in its own folder containing the solution file and a
   * per-problem README.md (time/space complexity, notes, metadata).
   */
  perProblemFolder: boolean;

  /**
   * Commit message template. Supported variables:
   *   {number} {title} {difficulty} {language} {date}
   */
  commitMessageTemplate: string;

  /** Automatically sync when a submission is accepted. */
  autoSync: boolean;

  /** Generate / update a README.md with progress statistics. */
  includeReadme: boolean;

  /** Append problem notes to the solution file header. */
  includeNotes: boolean;
}
