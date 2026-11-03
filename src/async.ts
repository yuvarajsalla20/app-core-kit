/** Rejects with `message` if the task takes longer than `ms`. The task itself is not cancelled. */
export const withTimeout = <T>(task: Promise<T>, ms: number, message = 'Timed out'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    task.then(resolve, reject).finally(() => clearTimeout(timer));
  });

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts?: number;
  /** Wait before the second try; doubles each time. */
  baseMs?: number;
  /** Return false for errors that will never succeed (like "permission denied"), so they are not retried. */
  shouldRetry?: (error: unknown) => boolean;
}

/** Runs `task`, trying again with a growing wait when it fails. Throws the last error. */
export const retry = async <T>(task: () => Promise<T>, { attempts = 3, baseMs = 500, shouldRetry = () => true }: RetryOptions = {}): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (e) {
      if (attempt >= attempts || !shouldRetry(e)) throw e;
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
};
