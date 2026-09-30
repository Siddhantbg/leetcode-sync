/** Minimal shapes for the GitHub REST responses we consume. */

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

/** Response from GET /repos/{owner}/{repo}/contents/{path} for a single file. */
export interface GitHubFileMeta {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  sha: string;
  path: string;
  html_url: string;
  /** Base64-encoded file body (present on single-file GET). */
  content?: string;
  encoding?: string;
}

/** Response from PUT /repos/{owner}/{repo}/contents/{path} (create/update). */
export interface GitHubContentWriteResponse {
  content: {
    sha: string;
    path: string;
    html_url: string;
  } | null;
  commit: {
    sha: string;
    html_url: string;
  };
}

export interface GitHubErrorBody {
  message: string;
  documentation_url?: string;
  status?: string;
}
