/**
 * Content script (isolated world).
 *
 * Detects accepted submissions by polling LeetCode's GraphQL API for the
 * current problem (CSP-proof, no MAIN-world injection needed), enriches them
 * into a typed Submission via the parser, and forwards to the background.
 *
 * It performs NO GitHub upload — dedupe / autoSync / retries / commits are all
 * enforced by the background worker, the single authority.
 */
import {
  buildSubmissionForAc,
  fetchQuestionMeta,
  getCurrentUsername,
  getLatestAcForSlug,
} from '@/parser';
import {
  getSeenSubmissionIds,
  markSubmissionSeen,
} from '@/storage';
import {
  MessageType,
  type GetCurrentSubmissionResponse,
  type ProblemRef,
  type RuntimeMessage,
  type Submission,
} from '@/types';

/** How often to check for a new accepted submission while the tab is visible. */
const POLL_INTERVAL_MS = 5000;

let username: string | null = null;
let timer: number | undefined;

/**
 * The script can be injected again into a tab (after an extension reload);
 * only the newest copy keeps running.
 */
const INSTANCE = Math.random().toString(36).slice(2);
document.documentElement.dataset.leetcodeSync = INSTANCE;

function isCurrentInstance(): boolean {
  return document.documentElement.dataset.leetcodeSync === INSTANCE;
}

/**
 * True while this script is still connected to a live extension. After the
 * extension is reloaded/updated, orphaned content scripts on already-open tabs
 * lose their connection; `chrome.runtime.id` becomes undefined and any
 * chrome.* call throws "Extension context invalidated". We check this to bail
 * out cleanly rather than spamming errors.
 */
function isExtensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

/** Stop all activity (a newer copy of this script, if any, takes over). */
function shutdown(): void {
  if (timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
  if (!isCurrentInstance()) return;
  console.info(
    '[LeetCode Sync] extension was reloaded — refresh this page to resume syncing.',
  );
}

function currentSlug(): string | null {
  const match = location.pathname.match(/\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

async function resolveUsername(): Promise<string | null> {
  if (!username) {
    username = await getCurrentUsername();
  }
  return username;
}

/** Build a Submission for the problem currently open in this tab. */
export async function fetchCurrentProblemSubmission(): Promise<
  import('@/types').Submission | null
> {
  const slug = currentSlug();
  if (!slug) return null;

  const user = await resolveUsername();
  if (!user) return null;

  const latest = await getLatestAcForSlug(user, slug);
  if (!latest) return null;

  return buildSubmissionForAc(latest);
}

async function forwardSubmission(
  submission: import('@/types').Submission,
  slug: string,
  submissionId: string,
): Promise<void> {
  const message: RuntimeMessage = {
    type: MessageType.SubmissionAccepted,
    submission,
  };
  try {
    const result = (await chrome.runtime.sendMessage(message)) as
      | { ok?: boolean }
      | undefined;
    if (result?.ok !== false) {
      await markSubmissionSeen(slug, submissionId);
    }
    console.info(
      '[LeetCode Sync] forwarded accepted submission',
      submission.key,
      `(id ${submissionId})`,
    );
  } catch (err) {
    // A reloaded extension orphans this script; stop instead of erroring.
    if (!isExtensionAlive()) {
      shutdown();
      return;
    }
    console.error('[LeetCode Sync] failed to forward submission', err);
  }
}

async function checkForAcceptedSubmission(): Promise<void> {
  if (!isExtensionAlive() || !isCurrentInstance()) {
    shutdown();
    return;
  }

  const slug = currentSlug();
  if (!slug) return;

  const user = await resolveUsername();
  if (!user) return;

  const latest = await getLatestAcForSlug(user, slug);
  if (!latest) return;

  try {
    const seen = await getSeenSubmissionIds();
    if (seen[slug] === latest.id) return;

    const submission = await buildSubmissionForAc(latest);
    if (!submission) {
      console.warn('[LeetCode Sync] could not build submission (missing data)');
      return;
    }

    await forwardSubmission(submission, slug, latest.id);
  } catch (err) {
    if (!isExtensionAlive()) {
      shutdown();
      return;
    }
    console.error('[LeetCode Sync] check failed', err);
  }
}

function tick(): void {
  if (!isExtensionAlive() || !isCurrentInstance()) {
    shutdown();
    return;
  }
  if (document.visibilityState === 'visible') {
    void checkForAcceptedSubmission();
  }
}

console.info('[LeetCode Sync] content script ready on', location.host);

timer = window.setInterval(tick, POLL_INTERVAL_MS);
void checkForAcceptedSubmission();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForAcceptedSubmission();
});

/** The open problem, even when it has no accepted submission yet. */
async function fetchCurrentProblem(
  submission: Submission | null,
): Promise<ProblemRef | null> {
  if (submission) {
    const { number, title, titleSlug, difficulty } = submission;
    return { number, title, titleSlug, difficulty };
  }
  const slug = currentSlug();
  const meta = slug ? await fetchQuestionMeta(slug) : null;
  return meta
    ? { number: meta.number, title: meta.title, titleSlug: meta.titleSlug, difficulty: meta.difficulty }
    : null;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message?.type !== MessageType.GetCurrentSubmission || !isCurrentInstance()) return;
  void (async () => {
    const submission = await fetchCurrentProblemSubmission().catch(() => null);
    const problem = await fetchCurrentProblem(submission).catch(() => null);
    const response: GetCurrentSubmissionResponse = { submission, problem };
    sendResponse(response);
  })();
  return true;
});

window.addEventListener('pagehide', () => {
  if (timer !== undefined) window.clearInterval(timer);
});
