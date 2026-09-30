/**
 * Sanitize a user-provided approach label for use in keys and filenames.
 * Returns empty string if nothing usable remains.
 */
export function sanitizeApproach(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|.\s]+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Stable dedupe key for a submission.
 *   default: "1-python3"
 *   named:   "1-python3-hashmap"
 */
export function submissionKey(
  number: number,
  language: string,
  approach?: string | null,
): string {
  const label = sanitizeApproach(approach);
  return label ? `${number}-${language}-${label}` : `${number}-${language}`;
}
