/**
 * Fast, stable, non-cryptographic string hash (FNV-1a, 32-bit) returned as hex.
 *
 * Used only to detect whether a solution's source code changed between
 * submissions — collision risk is irrelevant for that purpose, and it avoids
 * the async overhead of crypto.subtle in the service worker.
 */
export function hashString(input: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiplication via shifts (stays within 32 bits).
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
