/** The most a timer can wait (about 24.8 days); a larger number would make the timer fire at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Thrown by `withTimeout` when the task takes too long. `code` is `'timeout'`, so other code can tell it apart from a lost connection. */
export class TimeoutError extends Error {
  readonly code = 'timeout';
  constructor(message = 'Timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/** True for a `TimeoutError`, or any error whose `code` is `'timeout'` (another kit's, for example). */
export const isTimeoutError = (error: unknown): boolean => (error as { code?: string } | null)?.code === 'timeout';

/**
 * Rejects with a `TimeoutError` carrying `message` if the task takes longer than `ms`. The task itself is not cancelled.
 * `ms` must be a number of zero or more; anything else rejects with a RangeError, and very large values wait the longest a timer can.
 */
export const withTimeout = <T>(task: Promise<T>, ms: number, message = 'Timed out'): Promise<T> => {
  if (typeof ms !== 'number' || !(ms >= 0)) return Promise.reject(new RangeError(`withTimeout: ms must be zero or more, got ${String(ms)}`));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(message)), Math.min(ms, MAX_TIMER_MS));
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });
};

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /** Total tries, including the first. A whole number of 1 or more (less runs once); NaN or Infinity throws a RangeError. */
  attempts?: number;
  /** Wait before the second try; doubles each time. */
  baseMs?: number;
  /** The longest any single wait may be. Default 30 seconds. */
  maxMs?: number;
  /** Spread each wait randomly between half and the full time, so many phones do not retry together. Default true. */
  jitter?: boolean;
  /** Return false for errors that will never succeed (like "permission denied"), so they are not retried. */
  shouldRetry?: (error: unknown) => boolean;
}

/** Runs `task`, trying again with a growing wait when it fails. Throws the last error. */
export const retry = async <T>(task: () => Promise<T>, { attempts = 3, baseMs = 500, maxMs = 30_000, jitter = true, shouldRetry = () => true }: RetryOptions = {}): Promise<T> => {
  if (!Number.isFinite(attempts)) throw new RangeError(`retry: attempts must be a finite number, got ${String(attempts)}`);
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (e) {
      if (attempt >= attempts || !shouldRetry(e)) throw e;
      const wait = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      await sleep(jitter ? wait * (0.5 + Math.random() / 2) : wait);
    }
  }
};
