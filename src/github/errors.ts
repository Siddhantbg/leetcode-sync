export type GitHubErrorKind =
  | 'auth' //        401 - bad/expired token
  | 'not_found' //   404 - repo / branch / path missing
  | 'rate_limit' //  403/429 - rate limited
  | 'conflict' //    409 - sha mismatch
  | 'validation' //  422 - invalid request
  | 'network' //     fetch threw (offline, DNS, CORS)
  | 'unknown';

export class GitHubApiError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number;

  constructor(kind: GitHubErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'GitHubApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Map any thrown error to a short, user-facing message for notifications/UI. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof GitHubApiError) {
    switch (error.kind) {
      case 'auth':
        return 'Invalid or expired GitHub token. Update it in Settings.';
      case 'not_found':
        return 'Repository or branch not found. Check your settings.';
      case 'rate_limit':
        return 'GitHub rate limit reached. Please try again later.';
      case 'conflict':
        return 'File changed on GitHub during sync. Please retry.';
      case 'validation':
        return error.message || 'GitHub rejected the request.';
      case 'network':
        return 'Network error contacting GitHub. Check your connection.';
      default:
        return error.message || 'Unexpected GitHub error.';
    }
  }
  return error instanceof Error ? error.message : 'Unexpected error.';
}
