import {
  getLastSubmission,
  getPopupState,
  getSettings,
  setLastSubmission,
} from '@/storage';
import {
  MessageType,
  type GetCurrentSubmissionResponse,
  type ProblemRef,
  type ResolveSyncTargetResponse,
  type RuntimeMessage,
  type Submission,
} from '@/types';
import { injectContentScript } from './inject';
import { updateSolution } from './solutions';
import { syncSubmission } from './sync';

/** The problem open in the active LeetCode tab and its latest accepted submission. */
async function queryActiveTab(): Promise<GetCurrentSubmissionResponse | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  const url = tab.url ?? '';
  if (!/leetcode\.(com|cn)\/problems\//.test(url)) return null;

  const ask = async () =>
    ((await chrome.tabs.sendMessage(tab.id!, {
      type: MessageType.GetCurrentSubmission,
    })) as GetCurrentSubmissionResponse | undefined) ?? null;

  try {
    return await ask();
  } catch {
    // No live content script (tab opened before the extension was reloaded).
    if (!(await injectContentScript(tab.id))) return null;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        return await ask();
      } catch {
        // script still starting
      }
    }
    return null;
  }
}

async function getSubmissionFromActiveTab(): Promise<Submission | null> {
  return (await queryActiveTab())?.submission ?? null;
}

function refOf(s: Submission | null): ProblemRef | null {
  return s ? { number: s.number, title: s.title, titleSlug: s.titleSlug, difficulty: s.difficulty } : null;
}

function hasAnnotations(message: {
  notes?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  label?: string;
}): boolean {
  return Boolean(
    message.notes?.trim() ||
      message.timeComplexity?.trim() ||
      message.spaceComplexity?.trim() ||
      message.label?.trim(),
  );
}

/**
 * Prefer the active LeetCode tab; fall back to lastSubmission only when safe.
 * Annotations (notes/TC/SC) always require the active tab so they cannot land
 * on a different problem (e.g. Find Peak Element vs Find Peak Element II).
 */
async function resolveSyncTarget(opts: {
  requireActiveTab: boolean;
}): Promise<ResolveSyncTargetResponse | { submission: null; fromActiveTab: false; error: string }> {
  const fromTab = await getSubmissionFromActiveTab();
  if (fromTab) {
    await setLastSubmission(fromTab);
    return { submission: fromTab, fromActiveTab: true };
  }

  if (opts.requireActiveTab) {
    return {
      submission: null,
      fromActiveTab: false,
      error:
        'Open the exact LeetCode problem tab before syncing notes/TC/SC (prevents mix-ups like Peak Element vs Peak Element II).',
    };
  }

  const last = await getLastSubmission();
  return { submission: last, fromActiveTab: false };
}

/**
 * Resolve a single runtime message to a response object. Kept separate from the
 * listener so the async flow is easy to read and test.
 */
async function route(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case MessageType.SubmissionAccepted: {
      // Placement (primary / revision / new solution) is decided by the code
      // itself in syncSubmission — no user setup required.
      const settings = await getSettings();
      if (settings.autoSync) return syncSubmission(message.submission);
      await setLastSubmission(message.submission);
      return { ok: true };
    }

    case MessageType.ForceSync: {
      const annotated = hasAnnotations(message);
      const resolved = await resolveSyncTarget({ requireActiveTab: annotated });
      if (!resolved.submission) {
        return {
          ok: false,
          error:
            'error' in resolved && resolved.error
              ? resolved.error
              : 'No submission found. Open a solved LeetCode problem, or solve one first.',
        };
      }

      const base = resolved.submission;

      if (
        message.expectedNumber != null &&
        message.expectedNumber !== base.number
      ) {
        return {
          ok: false,
          error: `Notes target mismatch: popup has #${message.expectedNumber} but the open tab is #${base.number} ${base.title}. Open the correct problem tab.`,
        };
      }
      if (
        message.expectedTitleSlug &&
        message.expectedTitleSlug !== base.titleSlug
      ) {
        return {
          ok: false,
          error: `Notes target mismatch: expected "${message.expectedTitleSlug}" but open tab is "${base.titleSlug}". Open the correct problem tab.`,
        };
      }

      const submission: Submission = { ...base };
      delete submission.approach;
      delete submission.notes;
      delete submission.timeComplexity;
      delete submission.spaceComplexity;
      if (message.notes?.trim()) submission.notes = message.notes.trim();
      if (message.timeComplexity?.trim()) submission.timeComplexity = message.timeComplexity.trim();
      if (message.spaceComplexity?.trim()) submission.spaceComplexity = message.spaceComplexity.trim();
      if (message.label?.trim()) submission.label = message.label.trim();

      return syncSubmission(submission, {
        force: true,
        appendNotes: message.appendNotes,
        mode: message.mode ?? 'auto',
      });
    }

    case MessageType.UpdateSolution:
      return updateSolution(message);

    case MessageType.ResolveSyncTarget: {
      const tab = await queryActiveTab();
      if (tab?.submission) {
        await setLastSubmission(tab.submission);
        const response: ResolveSyncTargetResponse = {
          submission: tab.submission,
          fromActiveTab: true,
          problem: tab.problem ?? refOf(tab.submission),
        };
        return response;
      }
      if (tab?.problem) {
        // Open problem without an accepted submission yet (e.g. naming a slot first).
        const response: ResolveSyncTargetResponse = {
          submission: null,
          fromActiveTab: true,
          problem: tab.problem,
        };
        return response;
      }
      const last = await getLastSubmission();
      const response: ResolveSyncTargetResponse = {
        submission: last,
        fromActiveTab: false,
        problem: refOf(last),
      };
      return response;
    }

    case MessageType.GetState:
      return getPopupState();

    default:
      return { ok: true };
  }
}

/** Register the single chrome.runtime.onMessage listener (call at startup). */
export function registerMessageHandlers(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    route(message)
      .then(sendResponse)
      .catch((err: unknown) =>
        sendResponse({ ok: false, error: String(err) }),
      );
    return true;
  });
}
