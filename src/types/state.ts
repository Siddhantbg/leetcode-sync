import type { Stats, LastSynced } from './stats';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/** Persisted, transient sync state (separate from durable stats). */
export interface SyncState {
  status: SyncStatus;
  /** Human-readable error message when status === 'error'. */
  error: string | null;
  /**
   * Optional context for idle/success (e.g. "No code changes — already synced").
   * Cleared when a new sync attempt starts.
   */
  detail: string | null;
  /** Epoch milliseconds of the last status change. */
  updatedAt: number;
}

/**
 * Snapshot the popup renders. Assembled by the background worker from settings,
 * stats and sync state so the popup needs no business logic of its own.
 */
export interface PopupState {
  connected: boolean;
  username: string | null;
  repo: string | null;
  branch: string | null;
  sync: SyncState;
  lastSynced: LastSynced | null;
  totalSynced: number;
  stats: Stats;
}
