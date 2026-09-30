/**
 * UTF-8 safe base64 encoding for the GitHub Contents API.
 *
 * `btoa` only handles Latin-1, so we encode to UTF-8 bytes first. Chunked to
 * avoid call-stack limits on very large files.
 */
export function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Decode a base64 string produced by `utf8ToBase64` / GitHub Contents API. */
export function base64ToUtf8(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
