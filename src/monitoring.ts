import { installGlobalHandler } from './globalHandler';
import { reportError, scrub, setReporter } from './report';

export interface MonitoringOptions {
  /** The Sentry address. Leave empty and nothing leaves the phone: errors are still caught, just not sent. */
  dsn?: string;
}

type Loose = Record<string, unknown>;

const scrubDeep = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return scrub(value);
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v, depth + 1)]));
};

/** Cleans a crash-service event before it is sent: every text field is scrubbed, and user, request and breadcrumbs are removed. */
export const scrubEvent = <E extends object>(event: E): E => {
  const copy = { ...event } as Loose;
  for (const key of ['user', 'request', 'breadcrumbs']) delete copy[key];
  for (const key of ['message', 'exception', 'extra', 'tags', 'contexts']) if (key in copy) copy[key] = scrubDeep(copy[key]);
  return copy as E;
};

/**
 * Starts error catching and, when a Sentry address is given, crash reporting. Call once at app launch.
 * Sentry is optional: the app must install `@sentry/react-native` to use it, and it loads only when the address is set.
 * Nothing personal is sent: no screenshots, no breadcrumbs, no user details, and every text field is scrubbed.
 */
export const startMonitoring = async ({ dsn }: MonitoringOptions = {}): Promise<void> => {
  installGlobalHandler();
  if (!dsn) return;
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
      beforeSend: (event) => scrubEvent(event),
    });
    setReporter((where, error, extra) => Sentry.captureException(error, { tags: { where }, extra }), { capturesGlobalErrors: true });
  } catch (e) {
    // Monitoring must never stop the app from starting.
    reportError('monitoring', e);
  }
};
