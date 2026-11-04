/** Sends a handled problem somewhere useful (a crash service). `where` names the place, `extra` is small, non-personal context. */
export type Reporter = (where: string, error: Error, extra?: Record<string, string | number | boolean>) => void;

let reporter: Reporter | null = null;
let reporterCapturesGlobal = false;
const waiting: Parameters<Reporter>[] = [];
const recent = new Map<string, number>();
const SAME_ERROR_GAP_MS = 5_000;
const MAX_REMEMBERED = 50;
const MAX_WAITING = 20;
// A loop of different errors must not flood the crash service either: at most this many reports per minute.
const MAX_PER_MINUTE = 30;
const MINUTE_MS = 60_000;
const sentAt: number[] = [];
let droppedEarly = 0;
let heldBack = 0;

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
  if (droppedEarly) {
    deliver('reporter', new Error(`${droppedEarly} reports made before the crash service was connected were dropped`), { dropped: droppedEarly });
    droppedEarly = 0;
  }
};

/** True when the connected crash service already reports uncaught errors on its own. */
export const capturesGlobalErrors = (): boolean => reporterCapturesGlobal;

// Order matters: tokens and addresses are matched before the looser number patterns can break them apart.
const PATTERNS: [RegExp, string][] = [
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[token]'],
  [/eyJ[\w-]{6,}\.[\w-]{6,}/g, '[token]'], // a JWT cut short
  [/ExponentPushToken\[[^\]]*\]/g, '[token]'],
  [/\bBearer\s+\S+/gi, 'Bearer [token]'],
  [/\b(token|access_token|refresh_token|api[_-]?key|key|secret|password|passwd|pwd|auth|sig|signature)=[^\s&"']+/gi, '$1=[secret]'],
  [/\?[^\s"'#]+/g, '?[query]'], // everything after a ? in a link can carry a secret
  [/\b[0-9a-f]{32,}\b/gi, '[token]'],
  [/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}\b/g, '[token]'],
  // An address needs text before the @ and a dot after it, so a scoped package path like node_modules/@scope/pkg is left alone.
  [/[^\s@<>()/]{1,64}@[^\s@<>()/]{1,255}\.[^\s@<>()/]{2,}/gu, '[email]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]'],
  [/\b(?:[0-9a-f]{1,4}:){5,7}[0-9a-f]{1,4}\b/gi, '[ip]'],
  [/\b(?:[0-9a-f]{1,4}:){1,7}:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6}\b/gi, '[ip]'],
  [/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\:]+/g, '[home]'],
  [/\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}/g, '[number]'],
  [/\p{Nd}(?:[ \u00a0.\-/]?\p{Nd}){5,}/gu, '[number]'],
];

// Reports are short. Cutting long text first keeps scrubbing fast even if an error carries a huge response body.
const MAX_SCRUBBED = 4_000;

/** Removes emails, phone and card-like numbers, long numbers and token-like strings, so reports never carry personal data. */
export const scrub = (text: string): string =>
  PATTERNS.reduce((out, [pattern, label]) => out.replace(pattern, label), text.length > MAX_SCRUBBED ? `${text.slice(0, MAX_SCRUBBED)}…` : text);

const toError = (error: unknown, depth = 0): Error => {
  const source = error instanceof Error ? error : new Error(String(error));
  const clean = new Error(scrub(source.message)) as Error & { code?: string; cause?: unknown };
  clean.name = scrub(source.name);
  clean.stack = source.stack ? scrub(source.stack) : undefined;
  const code = (source as { code?: unknown }).code;
  if (typeof code === 'string') clean.code = scrub(code); // keeps "permission-denied" and friends for the crash service
  const cause = (source as { cause?: unknown }).cause;
  if (cause !== undefined && depth < 3) clean.cause = toError(cause, depth + 1);
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
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(`[${place}] ${clean.message}`);
    // Digits are blanked in the key, so "failed item 17" and "failed item 18" count as the same error.
    const key = `${place}|${clean.name}|${clean.message.replace(/\d+/g, '#')}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < SAME_ERROR_GAP_MS) return;
    recent.delete(key);
    if (recent.size >= MAX_REMEMBERED) recent.delete(recent.keys().next().value as string); // forget only the oldest
    recent.set(key, now);
    while (sentAt.length && now - sentAt[0] >= MINUTE_MS) sentAt.shift();
    if (sentAt.length >= MAX_PER_MINUTE) {
      heldBack++;
      return;
    }
    sentAt.push(now);
    const extraOut = scrubExtra(heldBack ? { ...extra, heldBack } : extra);
    heldBack = 0;
    const args: Parameters<Reporter> = [place, clean, extraOut];
    if (reporter) deliver(...args);
    else if (waiting.length < MAX_WAITING) waiting.push(args);
    else droppedEarly++;
  } catch {
    // Reporting must never be the thing that fails.
  }
};
