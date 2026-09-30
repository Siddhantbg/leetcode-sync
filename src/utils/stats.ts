import type { LastSynced, Stats, Streak, Submission } from '@/types';
import { localDateKey } from './format';

/**
 * Calendar yesterday in the local timezone (not "24 hours ago", which breaks
 * around DST and near midnight).
 */
export function localYesterdayKey(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
  return localDateKey(d);
}

/**
 * Advance the daily streak for a sync that happened "now".
 *  - Already synced today → unchanged
 *  - Last sync was yesterday → current + 1
 *  - Otherwise → reset to 1
 */
export function advanceStreak(streak: Streak, now: Date = new Date()): Streak {
  const today = localDateKey(now);
  if (streak.lastSyncDate === today) {
    return { ...streak };
  }

  const yesterday = localYesterdayKey(now);
  const current =
    streak.lastSyncDate === yesterday ? streak.current + 1 : 1;

  return {
    current,
    longest: Math.max(streak.longest, current),
    lastSyncDate: today,
  };
}

/**
 * Produce an updated Stats object after a successful sync.
 *
 *  - totalSynced / byDifficulty only grow for a new problem+language pair
 *    (re-syncing or adding another solution isn't double-counted).
 *  - The daily streak advances once per calendar day: +1 if the previous sync
 *    was yesterday, reset to 1 otherwise, unchanged if already synced today.
 *  - Call {@link touchStreakForActivity} even when code is unchanged so a day
 *    of re-submits still counts toward the streak.
 *
 * Pure function — does not touch storage.
 */
export function applySync(
  stats: Stats,
  submission: Submission,
  url?: string,
  codeHash?: string,
): Stats {
  const next: Stats = {
    ...stats,
    byDifficulty: { ...stats.byDifficulty },
    streak: advanceStreak(stats.streak),
    syncedKeys: [...stats.syncedKeys],
    contentHashes: { ...stats.contentHashes },
  };

  // Counters track problem+language pairs; extra solutions of the same pair
  // ("1-python3-solution-2") are recorded but not counted again.
  const pair = `${submission.number}-${submission.language}`;
  const pairCounted = next.syncedKeys.some(
    (k) => k === pair || k.startsWith(`${pair}-`),
  );
  if (!next.syncedKeys.includes(submission.key)) {
    if (!pairCounted) {
      next.totalSynced += 1;
      next.byDifficulty[submission.difficulty] += 1;
    }
    next.syncedKeys.push(submission.key);
  }

  if (codeHash) next.contentHashes[submission.key] = codeHash;

  const lastSynced: LastSynced = {
    number: submission.number,
    title: submission.title,
    difficulty: submission.difficulty,
    language: submission.language,
    syncedAt: Date.now(),
    url,
  };
  next.lastSynced = lastSynced;

  return next;
}

/**
 * Count today toward the streak without treating the submission as a new
 * solve (used when code is unchanged / already on GitHub).
 */
export function touchStreakForActivity(stats: Stats): Stats {
  const streak = advanceStreak(stats.streak);
  if (
    streak.current === stats.streak.current &&
    streak.lastSyncDate === stats.streak.lastSyncDate &&
    streak.longest === stats.streak.longest
  ) {
    return stats;
  }
  return { ...stats, streak };
}
