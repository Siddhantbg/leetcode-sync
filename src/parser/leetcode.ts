/**
 * LeetCode data access via the site's own GraphQL API.
 *
 * Why GraphQL (and not network interception): the content script runs in the
 * page's origin with the user's session cookies, so it can call LeetCode's
 * GraphQL endpoint directly. This is immune to the page's Content-Security-
 * Policy (which blocks MAIN-world script injection) and far more stable than
 * scraping the DOM or patching fetch.
 *
 * Flow:
 *   1. getCurrentUsername()            -> who is logged in
 *   2. getRecentAcSubmissions(user)    -> recent ACCEPTED submissions (ids/slugs)
 *   3. getSubmissionDetails(id)        -> the actual code + runtime/memory/lang
 *   4. fetchQuestionMeta(slug)         -> number/title/difficulty/tags
 *   5. buildSubmissionForAc()          -> assembles a typed Submission
 */
import type { Difficulty, Submission } from '@/types';
import { submissionKey } from '@/utils/approach';
import { languageToExt } from '@/utils/language';

/** Use whichever LeetCode domain the page is on (.com / .cn). */
function leetcodeOrigin(): string {
  if (
    typeof location !== 'undefined' &&
    /leetcode\.(com|cn)$/.test(location.hostname)
  ) {
    return location.origin;
  }
  return 'https://leetcode.com';
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)'),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** POST a GraphQL query with the session cookie + CSRF token. Returns data or null. */
async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName?: string,
): Promise<T | null> {
  try {
    const csrf = getCookie('csrftoken');
    const res = await fetch(`${leetcodeOrigin()}/graphql/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrftoken': csrf } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({
        query,
        variables,
        ...(operationName ? { operationName } : {}),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

function normalizeDifficulty(value: string | undefined): Difficulty {
  if (value === 'Easy' || value === 'Medium' || value === 'Hard') return value;
  return 'Medium';
}

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export interface AcSubmission {
  /** Numeric submission id (as a string from the API). */
  id: string;
  titleSlug: string;
  /** Epoch seconds (string). */
  timestamp: string;
}

/** Logged-in username, or null if signed out. */
export async function getCurrentUsername(): Promise<string | null> {
  const data = await graphql<{
    userStatus?: { isSignedIn?: boolean; username?: string };
  }>(
    `query globalData { userStatus { isSignedIn username } }`,
    {},
    'globalData',
  );
  const status = data?.userStatus;
  return status?.isSignedIn && status.username ? status.username : null;
}

/** Recent ACCEPTED submissions for a user, newest first. */
export async function getRecentAcSubmissions(
  username: string,
  limit = 20,
): Promise<AcSubmission[]> {
  const data = await graphql<{ recentAcSubmissionList?: AcSubmission[] }>(
    `query recentAc($username: String!, $limit: Int!) {
       recentAcSubmissionList(username: $username, limit: $limit) {
         id
         titleSlug
         timestamp
       }
     }`,
    { username, limit },
    'recentAc',
  );
  return data?.recentAcSubmissionList ?? [];
}

/** Newest accepted submission for one problem slug, if any. */
export async function getLatestAcForSlug(
  username: string,
  slug: string,
): Promise<AcSubmission | null> {
  const submissions = await getRecentAcSubmissions(username, 50);
  return submissions.find((s) => s.titleSlug === slug) ?? null;
}

interface SubmissionDetails {
  code: string;
  runtimeDisplay?: string;
  memoryDisplay?: string;
  langName: string;
}

/** Full details (code + runtime/memory + language) for one submission. */
export async function getSubmissionDetails(
  submissionId: number,
): Promise<SubmissionDetails | null> {
  const data = await graphql<{
    submissionDetails?: {
      code?: string;
      runtimeDisplay?: string;
      memoryDisplay?: string;
      lang?: { name?: string };
    };
  }>(
    `query submissionDetails($submissionId: Int!) {
       submissionDetails(submissionId: $submissionId) {
         code
         runtimeDisplay
         memoryDisplay
         lang { name }
       }
     }`,
    { submissionId },
    'submissionDetails',
  );

  const d = data?.submissionDetails;
  if (!d || !d.code) return null;
  return {
    code: d.code,
    runtimeDisplay: d.runtimeDisplay,
    memoryDisplay: d.memoryDisplay,
    langName: d.lang?.name ?? 'unknown',
  };
}

interface QuestionMeta {
  number: number;
  title: string;
  titleSlug: string;
  difficulty: Difficulty;
  tags: string[];
}

/** Problem metadata (number/title/difficulty/tags) by slug. */
export async function fetchQuestionMeta(
  slug: string,
): Promise<QuestionMeta | null> {
  if (!slug) return null;
  const data = await graphql<{
    question?: {
      questionFrontendId?: string;
      title?: string;
      titleSlug?: string;
      difficulty?: string;
      topicTags?: Array<{ name?: string }>;
    };
  }>(
    `query questionMeta($titleSlug: String!) {
       question(titleSlug: $titleSlug) {
         questionFrontendId
         title
         titleSlug
         difficulty
         topicTags { name }
       }
     }`,
    { titleSlug: slug },
    'questionMeta',
  );

  const q = data?.question;
  if (!q || !q.questionFrontendId || !q.titleSlug) return null;
  return {
    number: Number(q.questionFrontendId),
    title: q.title ?? q.titleSlug,
    titleSlug: q.titleSlug,
    difficulty: normalizeDifficulty(q.difficulty),
    tags: (q.topicTags ?? [])
      .map((t) => t.name)
      .filter((n): n is string => Boolean(n)),
  };
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

/** Build a fully-typed Submission from a recent AC submission entry. */
export async function buildSubmissionForAc(
  sub: AcSubmission,
): Promise<Submission | null> {
  const [details, meta] = await Promise.all([
    getSubmissionDetails(Number(sub.id)),
    fetchQuestionMeta(sub.titleSlug),
  ]);
  if (!details || !meta) return null;

  const language = details.langName;
  return {
    key: submissionKey(meta.number, language),
    number: meta.number,
    title: meta.title,
    titleSlug: meta.titleSlug,
    difficulty: meta.difficulty,
    language,
    languageExt: languageToExt(language),
    code: details.code,
    submittedAt: Number(sub.timestamp) * 1000 || Date.now(),
    leetcodeSubmissionId: sub.id,
    runtime: details.runtimeDisplay || undefined,
    memory: details.memoryDisplay || undefined,
    tags: meta.tags,
    url: `${leetcodeOrigin()}/problems/${meta.titleSlug}/`,
  };
}
