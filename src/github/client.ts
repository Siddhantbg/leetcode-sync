import type { GitHubErrorBody } from '@/types';
import { GitHubApiError, type GitHubErrorKind } from './errors';

const API_BASE = 'https://api.github.com';

export interface GitHubRequestOptions {
  token: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** JSON body; omitted for GET. */
  body?: unknown;
}

function classify(response: Response, body?: GitHubErrorBody): GitHubErrorKind {
  const remaining = response.headers.get('x-ratelimit-remaining');
  switch (response.status) {
    case 401:
      return 'auth';
    case 403:
      return remaining === '0' ? 'rate_limit' : 'auth';
    case 429:
      return 'rate_limit';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'validation';
    default:
      return body ? 'unknown' : 'unknown';
  }
}

/**
 * Low-level GitHub REST request. Adds auth + versioning headers, parses JSON,
 * and converts every failure mode into a typed GitHubApiError. This is the only
 * place that talks to api.github.com.
 */
export async function ghRequest<T>(
  path: string,
  options: GitHubRequestOptions,
): Promise<{ data: T; status: number }> {
  const hasBody = options.body !== undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new GitHubApiError('network', 'Network error contacting GitHub.');
  }

  if (response.ok) {
    const data =
      response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    return { data, status: response.status };
  }

  let body: GitHubErrorBody | undefined;
  try {
    body = (await response.json()) as GitHubErrorBody;
  } catch {
    /* non-JSON error body */
  }

  throw new GitHubApiError(
    classify(response, body),
    body?.message ?? response.statusText,
    response.status,
  );
}
