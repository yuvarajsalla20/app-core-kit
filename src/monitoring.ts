import { installGlobalHandler } from './globalHandler';
import { reportError, scrub, setReporter } from './report';

export interface MonitoringOptions {
  /** The Sentry address. Leave empty and nothing leaves the phone: errors are still caught, just not sent. */
  dsn?: string;
}

type Loose = Record<string, unknown>;

const MAX_DEPTH = 8;

/** Scrubs every text value and every key. Anything nested deeper than the limit is replaced, never passed through. */
const scrubDeep = (value: unknown, depth = 0, key = ''): unknown => {
  if (typeof value === 'string') return GENERATED.has(key) ? value : scrub(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [scrub(k), scrubDeep(v, depth + 1, k)]));
};

// Removed outright: who the person is, what they sent, what they did, the computer's name.
const REMOVED = ['user', 'request', 'breadcrumbs', 'server_name', 'spans'];
// Left as they are because Sentry needs them to group, order and symbolicate (readable stack traces) the event.
const KEPT = new Set(['event_id', 'timestamp', 'platform', 'level', 'type', 'sdk', 'debug_meta', 'modules', 'release', 'dist', 'environment']);
// Ids and times the SDK makes up itself: no personal data, and scrubbing them breaks trace links and times.
const GENERATED = new Set(['trace_id', 'span_id', 'parent_span_id', 'boot_time', 'app_start_time', 'start_timestamp']);

/**
 * Cleans a crash-service event before it is sent: user, request, breadcrumbs, server name and spans are removed, the
 * phone's own name is removed, and every other text field and key is scrubbed (not just a few named ones).
 */
export const scrubEvent = <E extends object>(event: E): E => {
  const copy = { ...event } as Loose;
  for (const key of REMOVED) delete copy[key];
  for (const key of Object.keys(copy)) if (!KEPT.has(key)) copy[key] = scrubDeep(copy[key]);
  const contexts = copy.contexts as Record<string, Loose> | undefined;
  if (contexts?.device && typeof contexts.device === 'object') delete contexts.device.name; // "Yuvaraj's iPhone"
  return copy as E;
};

// Integration names that can capture what is on screen or ask the person for text: session replay, the feedback form, the screenshot button, shake-to-report.
const SCREEN_CAPTURE = /replay|feedback|screenshot|shaketoreport/i;

let starting: Promise<boolean> | null = null;

const start = async (dsn: string): Promise<boolean> => {
  try {
    const Sentry = await import('@sentry/react-native');
    Sentry.init({
      dsn,
      sendDefaultPii: false,
      attachScreenshot: false,
      attachViewHierarchy: false,
      maxBreadcrumbs: 0,
      beforeBreadcrumb: () => null,
      enableAutoSessionTracking: false,
      tracesSampleRate: 0,
      // Session replay and the feedback form can capture what is on screen: keep them out whatever the SDK enables by default.
      integrations: (defaults) => defaults.filter((i) => !SCREEN_CAPTURE.test(i.name)),
      beforeSend: (event) => scrubEvent(event),
    });
    setReporter((where, error, extra) => Sentry.captureException(error, { tags: { where }, extra }), { capturesGlobalErrors: true });
    return true;
  } catch (e) {
    // Monitoring must never stop the app from starting, but the owner must be able to tell it is not running.
    reportError('monitoring', e);
    console.warn(`[app-core-kit] crash reporting did not start: ${scrub(e instanceof Error ? e.message : String(e))}`);
    return false;
  }
};

/**
 * Starts error catching and, when a Sentry address is given, crash reporting. Call once at app launch (a second call
 * does nothing and returns the first result). Resolves true when Sentry is running, false when it is not: no address,
 * or it could not start (a warning is printed in that case).
 * Sentry is optional: the app must install `@sentry/react-native` to use it, and it loads only when the address is set.
 * Nothing personal is sent from JavaScript: no screenshots, breadcrumbs or user details, and every text field is scrubbed.
 * Crashes in native iPhone/Android code are reported by the Sentry SDK itself and are not covered by this scrubbing.
 */
export const startMonitoring = async ({ dsn }: MonitoringOptions = {}): Promise<boolean> => {
  installGlobalHandler();
  if (!dsn) return false;
  starting ??= start(dsn);
  return starting;
};
