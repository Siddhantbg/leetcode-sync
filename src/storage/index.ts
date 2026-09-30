/**
 * Typed wrapper around chrome.storage.local.
 *
 * This is the single place that touches chrome.storage. Everything else works
 * with strongly-typed Settings / Stats / SyncState objects. All reads merge the
 * stored value over defaults, so adding a new field is forward/backward safe.
 */
import type {
  PopupState,
  ProblemIndex,
  ProblemSlots,
  Settings,
  SolutionSlots,
  SolvedProblem,
  Stats,
  Submission,
  SyncState,
} from '@/types';
import {
  mergeSolutionIntoEntry,
  type MergeOptions,
  type SolutionWrite,
} from '@/utils/solution';
import { STORAGE_KEYS } from './keys';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  DEFAULT_SYNC_STATE,
} from './defaults';

export { STORAGE_KEYS } from './keys';
export {
  DEFAULT_SETTINGS,
  DEFAULT_STATS,
  DEFAULT_SYNC_STATE,
} from './defaults';

/* ------------------------------------------------------------------ */
/* Low-level helpers                                                   */
/* ------------------------------------------------------------------ */

async function readRaw<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function writeRaw(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

async function removeRaw(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

/* ------------------------------------------------------------------ */
/* GitHub token                                                        */
/* ------------------------------------------------------------------ */

export async function getToken(): Promise<string | null> {
  const token = await readRaw<string>(STORAGE_KEYS.token);
  return token && token.length > 0 ? token : null;
}

export async function setToken(token: string): Promise<void> {
  await writeRaw(STORAGE_KEYS.token, token.trim());
}

export async function removeToken(): Promise<void> {
  await removeRaw(STORAGE_KEYS.token);
}

export async function hasToken(): Promise<boolean> {
  return (await getToken()) !== null;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    // `github` is nested, so merge it explicitly to keep defaults for any
    // fields the stored object is missing.
    github: { ...DEFAULT_SETTINGS.github, ...(stored?.github ?? {}) },
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await readRaw<Partial<Settings>>(STORAGE_KEYS.settings);
  return mergeSettings(stored);
}

/** Shallow-patch settings (with nested `github` merge) and persist. */
export async function updateSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = {
    ...current,
    ...patch,
    github: { ...current.github, ...(patch.github ?? {}) },
  };
  await writeRaw(STORAGE_KEYS.settings, next);
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await writeRaw(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function mergeStats(stored: Partial<Stats> | undefined): Stats {
  return {
    ...DEFAULT_STATS,
    ...stored,
    byDifficulty: {
      ...DEFAULT_STATS.byDifficulty,
      ...(stored?.byDifficulty ?? {}),
    },
    streak: { ...DEFAULT_STATS.streak, ...(stored?.streak ?? {}) },
    syncedKeys: stored?.syncedKeys ?? [],
    contentHashes: stored?.contentHashes ?? {},
  };
}

export async function getStats(): Promise<Stats> {
  const stored = await readRaw<Partial<Stats>>(STORAGE_KEYS.stats);
  return mergeStats(stored);
}

export async function setStats(stats: Stats): Promise<void> {
  await writeRaw(STORAGE_KEYS.stats, stats);
}

export async function resetStats(): Promise<Stats> {
  await writeRaw(STORAGE_KEYS.stats, DEFAULT_STATS);
  return DEFAULT_STATS;
}

/** Whether a submission with this dedupe key has already been uploaded. */
export async function isAlreadySynced(key: string): Promise<boolean> {
  const stats = await getStats();
  return stats.syncedKeys.includes(key);
}

/* ------------------------------------------------------------------ */
/* Sync state (transient)                                              */
/* ------------------------------------------------------------------ */

export async function getSyncState(): Promise<SyncState> {
  const stored = await readRaw<Partial<SyncState>>(STORAGE_KEYS.syncState);
  return { ...DEFAULT_SYNC_STATE, ...stored };
}

export async function setSyncState(
  patch: Partial<SyncState>,
): Promise<SyncState> {
  const current = await getSyncState();
  const next: SyncState = { ...current, ...patch, updatedAt: Date.now() };
  await writeRaw(STORAGE_KEYS.syncState, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Last detected submission (enables Force Sync after SW restart)      */
/* ------------------------------------------------------------------ */

export async function getLastSubmission(): Promise<Submission | null> {
  return (await readRaw<Submission>(STORAGE_KEYS.lastSubmission)) ?? null;
}

export async function setLastSubmission(
  submission: Submission,
): Promise<void> {
  await writeRaw(STORAGE_KEYS.lastSubmission, submission);
}

/* ------------------------------------------------------------------ */
/* Seen submission ids (re-solve detection across reloads)             */
/* ------------------------------------------------------------------ */

export type SeenSubmissionIds = Record<string, string>;

export async function getSeenSubmissionIds(): Promise<SeenSubmissionIds> {
  return (
    (await readRaw<SeenSubmissionIds>(STORAGE_KEYS.seenSubmissionIds)) ?? {}
  );
}

export async function markSubmissionSeen(
  slug: string,
  submissionId: string,
): Promise<void> {
  const seen = await getSeenSubmissionIds();
  seen[slug] = submissionId;
  await writeRaw(STORAGE_KEYS.seenSubmissionIds, seen);
}

/* ------------------------------------------------------------------ */
/* Solved-problem index (solutions, classification, READMEs)           */
/* ------------------------------------------------------------------ */

export async function getProblemIndex(): Promise<ProblemIndex> {
  return (await readRaw<ProblemIndex>(STORAGE_KEYS.problemIndex)) ?? {};
}

/**
 * Record a synced solution in its problem entry (adding a language or a new
 * solution as needed), reclassify the problem's solutions and persist.
 */
export async function updateProblemIndex(
  submission: Submission,
  write: SolutionWrite,
  options: MergeOptions = {},
): Promise<ProblemIndex> {
  const index = await getProblemIndex();
  index[submission.number] = mergeSolutionIntoEntry(
    index[submission.number],
    submission,
    write,
    options,
  );
  await writeRaw(STORAGE_KEYS.problemIndex, index);
  return index;
}

/** Overwrite a single problem entry in the index. */
export async function setProblemEntry(
  problemNumber: number,
  entry: SolvedProblem,
): Promise<void> {
  const index = await getProblemIndex();
  index[problemNumber] = entry;
  await writeRaw(STORAGE_KEYS.problemIndex, index);
}

/* ------------------------------------------------------------------ */
/* Named solution slots                                                */
/* ------------------------------------------------------------------ */

export async function getSolutionSlots(): Promise<SolutionSlots> {
  return (await readRaw<SolutionSlots>(STORAGE_KEYS.solutionSlots)) ?? {};
}

export async function getProblemSlots(problemNumber: number): Promise<ProblemSlots> {
  return (await getSolutionSlots())[problemNumber] ?? { slots: [] };
}

export async function setProblemSlots(
  problemNumber: number,
  value: ProblemSlots,
): Promise<void> {
  const all = await getSolutionSlots();
  if (value.slots.length === 0) delete all[problemNumber];
  else all[problemNumber] = value;
  await writeRaw(STORAGE_KEYS.solutionSlots, all);
}

/**
 * Moving on to another problem abandons named solutions left unused on
 * earlier ones, so they can't capture a later submission unexpectedly.
 */
export async function discardSlotsExcept(problemNumber: number): Promise<void> {
  const all = await getSolutionSlots();
  const keep = all[problemNumber];
  const next: SolutionSlots = keep ? { [problemNumber]: keep } : {};
  if (Object.keys(all).length !== Object.keys(next).length) {
    await writeRaw(STORAGE_KEYS.solutionSlots, next);
  }
}

/**
 * Drop the pre-automatic "Multiple approaches" popup state (toggle, armed
 * pending approach). An armed approach would otherwise keep redirecting new
 * submissions; named slots replace it.
 */
export async function clearLegacyMultiSolutionPrefs(): Promise<void> {
  await removeRaw(STORAGE_KEYS.multiSolutionPrefs);
}

/* ------------------------------------------------------------------ */
/* Composed snapshot                                                   */
/* ------------------------------------------------------------------ */

/**
 * Assemble the full PopupState from storage. Shared by the popup (to render)
 * and the background worker (to broadcast STATE_UPDATED), so there is exactly
 * one definition of what "connected" means and how the snapshot is shaped.
 */
export async function getPopupState(): Promise<PopupState> {
  const [token, settings, stats, sync] = await Promise.all([
    getToken(),
    getSettings(),
    getStats(),
    getSyncState(),
  ]);

  const { username, repo, branch } = settings.github;
  const connected = Boolean(token && username && repo);

  return {
    connected,
    username: username || null,
    repo: repo || null,
    branch: branch || null,
    sync,
    lastSynced: stats.lastSynced,
    totalSynced: stats.totalSynced,
    stats,
  };
}

/* ------------------------------------------------------------------ */
/* Change subscription                                                 */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to chrome.storage.local changes. Returns an unsubscribe function.
 */
export function onStorageChanged(
  callback: (changes: Record<string, chrome.storage.StorageChange>) => void,
): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'local') callback(changes);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
