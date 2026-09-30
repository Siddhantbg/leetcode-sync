import type { Difficulty } from './submission';

export type DifficultyCounts = Record<Difficulty, number>;

export interface Streak {
  /** Consecutive-day sync streak. */
  current: number;
  longest: number;
  /** Last day a sync happened, as "YYYY-MM-DD" (local). null = never. */
  lastSyncDate: string | null;
}

/** Lightweight summary of the most recently synced problem (for the popup). */
export interface LastSynced {
  number: number;
  title: string;
  difficulty: Difficulty;
  language: string;
  /** Epoch milliseconds. */
  syncedAt: number;
  /** Link to the commit / file on GitHub, when available. */
  url?: string;
}

export interface Stats {
  totalSynced: number;
  byDifficulty: DifficultyCounts;
  streak: Streak;

  /**
   * Set of submission keys already uploaded, used to avoid duplicate uploads.
   * Stored as an array because chrome.storage cannot serialize a Set.
   */
  syncedKeys: string[];

  /**
   * Last-synced source-code hash per submission key. Lets us skip identical
   * resubmissions while still updating the file when the solution changes.
   */
  contentHashes: Record<string, string>;

  lastSynced: LastSynced | null;
}
