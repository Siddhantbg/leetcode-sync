/**
 * Storage keys used in chrome.storage.local.
 *
 * The token lives under its own key (not inside `settings`) so it can be
 * rotated/removed independently and is easy to exclude from any settings export.
 */
export const STORAGE_KEYS = {
  token: 'gh_token',
  settings: 'settings',
  stats: 'stats',
  syncState: 'sync_state',
  lastSubmission: 'last_submission',
  problemIndex: 'problem_index',
  /** Latest LeetCode submission id seen per problem slug (dedupe / re-solve detection). */
  seenSubmissionIds: 'seen_submission_ids',
  /** Named solutions created in the popup, waiting for a submission. */
  solutionSlots: 'solution_slots',
  /** Legacy "Multiple approaches" popup state; removed on install/update. */
  multiSolutionPrefs: 'multi_solution_prefs',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
