/** Small, dependency-free formatting helpers shared across UI surfaces. */

/** Human-friendly relative time, e.g. "just now", "5m ago", "3d ago". */
export function relativeTime(epochMs: number | null | undefined): string {
  if (!epochMs) return 'never';
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';

  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}

/** Compact number formatting, e.g. 1234 -> "1,234". */
export function formatCount(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** "YYYY-MM-DD" for the local timezone (used for streak day comparison). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
