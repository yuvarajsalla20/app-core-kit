/** Sends a handled problem somewhere useful (a crash service). `where` names the place, `extra` is small, non-personal context. */
export type Reporter = (where: string, error: Error, extra?: Record<string, string | number | boolean>) => void;

let reporter: Reporter | null = null;
const recent = new Map<string, number>();
const SAME_ERROR_GAP_MS = 5_000;
const MAX_REMEMBERED = 50;

/** Connects a crash service. Call once at start-up; pass null to disconnect. */
export const setReporter = (next: Reporter | null): void => {
  reporter = next;
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_NUMBER = /\d{6,}/g;

/** Removes email addresses and long numbers from text, so reports never carry personal data. */
export const scrub = (text: string): string => text.replace(EMAIL, '[email]').replace(LONG_NUMBER, '[number]');

const toError = (error: unknown): Error => {
  const source = error instanceof Error ? error : new Error(String(error));
  const clean = new Error(scrub(source.message));
  clean.name = source.name;
  clean.stack = source.stack ? scrub(source.stack) : undefined;
  return clean;
};

/**
 * The one place failures that are handled quietly get recorded. Never throws, and sends the same error from the
 * same place at most once every few seconds, so a loop cannot flood the crash service.
 */
export const reportError = (where: string, error: unknown, extra?: Record<string, string | number | boolean>): void => {
  try {
    const clean = toError(error);
    if (__DEV__) console.warn(`[${where}] ${clean.message}`);
    const key = `${where}|${clean.name}|${clean.message}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < SAME_ERROR_GAP_MS) return;
    if (recent.size >= MAX_REMEMBERED) recent.clear();
    recent.set(key, now);
    reporter?.(where, clean, extra);
  } catch {
    // Reporting must never be the thing that fails.
  }
};
