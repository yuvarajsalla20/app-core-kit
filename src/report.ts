/** Sends a handled problem somewhere useful (a crash service). `where` names the place, `extra` is small, non-personal context. */
export type Reporter = (where: string, error: Error, extra?: Record<string, string | number | boolean>) => void;

let reporter: Reporter | null = null;
let reporterCapturesGlobal = false;
const waiting: Parameters<Reporter>[] = [];
const recent = new Map<string, number>();
const SAME_ERROR_GAP_MS = 5_000;
const MAX_REMEMBERED = 50;
const MAX_WAITING = 20;

export interface ReporterOptions {
  /** Set when the crash service already catches uncaught errors itself (Sentry does), so the kit does not report them twice. */
  capturesGlobalErrors?: boolean;
}

/**
 * Connects a crash service. Call once at start-up; pass null to disconnect.
 * Errors reported before it was connected (up to 20) are sent now, so nothing from start-up is lost.
 */
export const setReporter = (next: Reporter | null, options: ReporterOptions = {}): void => {
  reporter = next;
  reporterCapturesGlobal = !!next && !!options.capturesGlobalErrors;
  if (!next) return;
  for (const args of waiting.splice(0)) deliver(...args);
};

/** True when the connected crash service already reports uncaught errors on its own. */
export const capturesGlobalErrors = (): boolean => reporterCapturesGlobal;

// Order matters: tokens and numbers are matched before the looser patterns can break them apart.
const PATTERNS: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]'],
  [/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g, '[token]'],
  [/[^\s@<>()]+@[^\s@<>()]+/gu, '[email]'],
  [/\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g, '[number]'],
  [/\d(?:[ -]?\d){5,}/g, '[number]'],
];

/** Removes emails, phone and card-like numbers, long numbers and token-like strings, so reports never carry personal data. */
export const scrub = (text: string): string => PATTERNS.reduce((out, [pattern, label]) => out.replace(pattern, label), text);

const toError = (error: unknown): Error => {
  const source = error instanceof Error ? error : new Error(String(error));
  const clean = new Error(scrub(source.message));
  clean.name = source.name;
  clean.stack = source.stack ? scrub(source.stack) : undefined;
  return clean;
};

const scrubExtra = (extra?: Record<string, string | number | boolean>): Record<string, string | number | boolean> | undefined =>
  extra && Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, typeof v === 'string' ? scrub(v) : v]));

const deliver = (...[where, error, extra]: Parameters<Reporter>): void => {
  try {
    reporter?.(where, error, extra);
  } catch {
    // A broken reporter must never break the app.
  }
};

/**
 * The one place failures that are handled quietly get recorded. Never throws, and sends the same error from the
 * same place at most once every few seconds, so a loop cannot flood the crash service.
 */
export const reportError = (where: string, error: unknown, extra?: Record<string, string | number | boolean>): void => {
  try {
    const clean = toError(error);
    const place = scrub(where);
    if (__DEV__) console.warn(`[${place}] ${clean.message}`);
    const key = `${place}|${clean.name}|${clean.message}`;
    const now = Date.now();
    if (now - (recent.get(key) ?? 0) < SAME_ERROR_GAP_MS) return;
    if (recent.size >= MAX_REMEMBERED) recent.clear();
    recent.set(key, now);
    const args: Parameters<Reporter> = [place, clean, scrubExtra(extra)];
    if (reporter) deliver(...args);
    else if (waiting.length < MAX_WAITING) waiting.push(args);
  } catch {
    // Reporting must never be the thing that fails.
  }
};
