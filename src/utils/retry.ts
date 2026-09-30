const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /** Number of *additional* attempts after the first (default 2). */
  retries?: number;
  /** Base delay used for exponential backoff, in ms (default 500). */
  baseDelayMs?: number;
  /** Decide whether a given error is worth retrying. Default: always. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * Run an async function with exponential-backoff retries. Useful for transient
 * network failures when talking to GitHub.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelay = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const canRetry = options.shouldRetry ? options.shouldRetry(error) : true;
      if (attempt === retries || !canRetry) break;
      await delay(baseDelay * 2 ** attempt);
    }
  }

  throw lastError;
}
