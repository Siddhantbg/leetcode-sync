import type {
  GitHubContentWriteResponse,
  GitHubFileMeta,
  GitHubUser,
} from '@/types';
import { utf8ToBase64, base64ToUtf8 } from '@/utils/base64';
import { ghRequest } from './client';
import { GitHubApiError } from './errors';

/** Encode each path segment but keep "/" separators intact. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function contentsPath(owner: string, repo: string, path: string): string {
  return `/repos/${owner}/${repo}/contents/${encodePath(path)}`;
}

/** Verify a token and return the authenticated user. */
export async function authenticate(token: string): Promise<GitHubUser> {
  const { data } = await ghRequest<GitHubUser>('/user', { token });
  return data;
}

/** Throws GitHubApiError('not_found') if the repo is missing/inaccessible. */
export async function getRepo(
  token: string,
  owner: string,
  repo: string,
): Promise<void> {
  await ghRequest(`/repos/${owner}/${repo}`, { token });
}

/** Return the blob SHA of a file, or null if it does not exist. */
export async function getFileSHA(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string | null> {
  try {
    const { data } = await ghRequest<GitHubFileMeta>(
      `${contentsPath(owner, repo, path)}?ref=${encodeURIComponent(branch)}`,
      { token },
    );
    return data.sha;
  } catch (error) {
    if (error instanceof GitHubApiError && error.kind === 'not_found') {
      return null;
    }
    throw error;
  }
}

/** Read a text file from the repo, or null if missing. */
export async function getFileContent(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<{ sha: string; content: string } | null> {
  try {
    const { data } = await ghRequest<GitHubFileMeta>(
      `${contentsPath(owner, repo, path)}?ref=${encodeURIComponent(branch)}`,
      { token },
    );
    if (data.type !== 'file' || !data.content) return null;
    const raw = data.content.replace(/\n/g, '');
    return { sha: data.sha, content: base64ToUtf8(raw) };
  } catch (error) {
    if (error instanceof GitHubApiError && error.kind === 'not_found') {
      return null;
    }
    throw error;
  }
}

export async function fileExists(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<boolean> {
  return (await getFileSHA(token, owner, repo, path, branch)) !== null;
}

export interface WriteFileParams {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
  content: string;
  message: string;
  /** Required when updating an existing file. */
  sha?: string;
}

async function putContents(
  params: WriteFileParams,
): Promise<GitHubContentWriteResponse> {
  const { data } = await ghRequest<GitHubContentWriteResponse>(
    contentsPath(params.owner, params.repo, params.path),
    {
      token: params.token,
      method: 'PUT',
      body: {
        message: params.message,
        content: utf8ToBase64(params.content),
        branch: params.branch,
        ...(params.sha ? { sha: params.sha } : {}),
      },
    },
  );
  return data;
}

/** Create a new file (no sha). */
export function createFile(
  params: Omit<WriteFileParams, 'sha'>,
): Promise<GitHubContentWriteResponse> {
  return putContents(params);
}

/** Update an existing file (sha required). */
export function updateFile(
  params: WriteFileParams & { sha: string },
): Promise<GitHubContentWriteResponse> {
  return putContents(params);
}

/**
 * Create-or-update convenience: looks up the current sha and writes
 * accordingly. Retries once on a 409 conflict with a fresh sha.
 */
export async function commitFile(
  params: WriteFileParams,
): Promise<GitHubContentWriteResponse> {
  const sha = await getFileSHA(
    params.token,
    params.owner,
    params.repo,
    params.path,
    params.branch,
  );

  try {
    return await putContents({ ...params, sha: sha ?? undefined });
  } catch (error) {
    if (error instanceof GitHubApiError && error.kind === 'conflict') {
      const freshSha = await getFileSHA(
        params.token,
        params.owner,
        params.repo,
        params.path,
        params.branch,
      );
      return putContents({ ...params, sha: freshSha ?? undefined });
    }
    throw error;
  }
}

/** Delete a file from the repo (no-op if missing). */
export async function deleteFile(params: {
  token: string;
  owner: string;
  repo: string;
  path: string;
  branch: string;
  message: string;
}): Promise<boolean> {
  const sha = await getFileSHA(
    params.token,
    params.owner,
    params.repo,
    params.path,
    params.branch,
  );
  if (!sha) return false;

  await ghRequest(contentsPath(params.owner, params.repo, params.path), {
    token: params.token,
    method: 'DELETE',
    body: {
      message: params.message,
      sha,
      branch: params.branch,
    },
  });
  return true;
}
