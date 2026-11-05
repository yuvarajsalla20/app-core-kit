import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', StyleSheet: { create: <T,>(x: T) => x }, Text: 'Text', View: 'View' }));

// The reporter keeps state, so every test gets a fresh copy of the modules.
type Monitoring = typeof import('../src/monitoring');
type Report = typeof import('../src/report');
let ErrorBoundary: typeof import('../src/ErrorBoundary').ErrorBoundary;
let scrubEvent: Monitoring['scrubEvent'];
let reportError: Report['reportError'], scrub: Report['scrub'], setReporter: Report['setReporter'];

beforeEach(async () => {
  vi.resetModules();
  ({ ErrorBoundary } = await import('../src/ErrorBoundary'));
  ({ scrubEvent } = await import('../src/monitoring'));
  ({ reportError, scrub, setReporter } = await import('../src/report'));
});
afterEach(() => {
  setReporter(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('secrets in JSON, headers and longer key names', () => {
  it('hides the value of a quoted JSON key, spaces included, also when the JSON sits inside a string', () => {
    expect(scrub('{"password":"hunter2"}')).toBe('{"password":"[secret]"}');
    expect(scrub('{"user":"x","client_secret":"my long secret","n":1}')).toBe('{"user":"x","client_secret":"[secret]","n":1}');
    expect(scrub('{\\"token\\":\\"abc 123\\"}')).not.toMatch(/abc|123/);
    expect(scrub("{'sid': 'abc'}")).not.toContain('abc');
  });
  it('hides whole header lines for authorization and cookies', () => {
    expect(scrub('Authorization: Basic dXNlcjpwYXNz')).toBe('Authorization: [secret]');
    expect(scrub('Cookie: sid=abc123; theme=dark')).toBe('Cookie: [secret]');
    expect(scrub('Set-Cookie: session=abc')).toBe('Set-Cookie: [secret]');
  });
  it('hides key=value for client_secret, session_id, id_token, sid and cookie', () => {
    for (const text of ['client_secret=abc123', 'session_id=abc123', 'id_token=abc', 'sid=abc', 'cookie=abc']) expect(scrub(text)).toMatch(/=\[secret\]$/);
  });
  it('leaves ordinary words alone', () => {
    for (const text of ['error code: 404 key: value', 'keyboard=on', 'the key is missing', 'Basic information needed', '{"keyboard":"x"}']) expect(scrub(text)).toBe(text);
  });
});

describe('release names and real addresses', () => {
  it('a release like com.app@1.2.0+45 is not an email address, but a real address is', () => {
    expect(scrub('com.hringnring@1.2.0+45')).toBe('com.hringnring@1.2.0+45');
    expect(scrub('me@163.com')).toBe('[email]');
    expect(scrub('me@example.com')).toBe('[email]');
  });
  it('scrubEvent keeps release, dist and environment, and still scrubs text and removes the person', () => {
    const out = scrubEvent({ release: 'com.hringnring@1.2.0+4155551234', dist: '4155551234', environment: 'production', user: { id: '1' }, message: 'failed for a@b.com' }) as Record<string, unknown>;
    expect(out).toMatchObject({ release: 'com.hringnring@1.2.0+4155551234', dist: '4155551234', environment: 'production', message: 'failed for [email]' });
    expect(out.user).toBeUndefined();
  });
  it('scrubEvent keeps ids and times the SDK made up, and still scrubs other text next to them', () => {
    const id = 'b'.repeat(32);
    const out = scrubEvent({ contexts: { trace: { trace_id: id, span_id: 'c'.repeat(16) }, device: { boot_time: '2026-11-04T08:00:00.000Z', model: 'iPhone15,2' }, app: { app_start_time: '2026-11-04T10:00:00Z', note: 'me@x.com' } } }) as { contexts: Record<string, Record<string, string>> };
    expect(out.contexts.trace).toEqual({ trace_id: id, span_id: 'c'.repeat(16) });
    expect(out.contexts.device).toMatchObject({ boot_time: '2026-11-04T08:00:00.000Z', model: 'iPhone15,2' });
    expect(out.contexts.app).toEqual({ app_start_time: '2026-11-04T10:00:00Z', note: '[email]' });
  });
});

describe('the phone\'s clock', () => {
  it('keeps reporting after the clock is set back, instead of waiting for it to catch up', () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    setReporter((where) => sent.push(where));
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
    for (let i = 0; i < 30; i++) reportError(`place${String.fromCharCode(97 + i)}`, new Error(`problem ${String.fromCharCode(97 + i)}`));
    expect(sent).toHaveLength(30);
    reportError('blocked', new Error('over the limit'));
    expect(sent).toHaveLength(30);
    vi.setSystemTime(new Date('2026-11-04T11:00:00Z'));
    vi.advanceTimersByTime(10 * 60_000);
    reportError('after', new Error('later problem'));
    expect(sent).toHaveLength(31);
  });
});

describe('ErrorBoundary reset keys and words', () => {
  const make = (props: Record<string, unknown> = {}) => {
    const b = new ErrorBoundary({ where: 'home', children: 'kids', ...props } as never);
    b.setState = ((s: { error: unknown }) => { b.state = s; }) as never;
    b.state = { error: new Error('x') };
    return b;
  };
  it('clears the error screen when a reset key changes, not otherwise', () => {
    const b = make({ resetKeys: ['a'] });
    b.componentDidUpdate({ where: 'home', children: 'kids', resetKeys: ['a'] });
    expect(b.state.error).not.toBeNull();
    b.componentDidUpdate({ where: 'home', children: 'kids', resetKeys: ['b'] });
    expect(b.state.error).toBeNull();
  });
  it('does nothing without reset keys, and when nothing is shown', () => {
    const none = make();
    none.componentDidUpdate({ where: 'home', children: 'kids' } as never);
    expect(none.state.error).not.toBeNull();
    const fine = make({ resetKeys: ['b'] });
    fine.state = { error: null };
    const spy = vi.fn();
    fine.setState = spy as never;
    fine.componentDidUpdate({ where: 'home', children: 'kids', resetKeys: ['a'] });
    expect(spy).not.toHaveBeenCalled();
  });
  it('shows the app\'s own words, and the plain defaults otherwise', () => {
    const text = (b: InstanceType<typeof ErrorBoundary>) => JSON.stringify(b.render());
    expect(text(make())).toContain('Something went wrong');
    expect(text(make())).toContain('Try again');
    const custom = text(make({ strings: { title: 'Oups', retry: 'Réessayer', message: () => 'Un problème.' } }));
    expect(custom).toContain('Oups');
    expect(custom).toContain('Réessayer');
    expect(custom).toContain('Un problème.');
    expect(custom).not.toContain('Try again');
  });
});

describe('withMonitoring (expo.js)', () => {
  const load = (env: Record<string, string | undefined>) => {
    for (const k of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) vi.stubEnv(k, env[k] ?? '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { withMonitoring } = createRequire(import.meta.url)('../expo.js') as { withMonitoring: (c: object) => { plugins?: unknown[] } };
    return { out: withMonitoring({ name: 'x' }), warn };
  };
  afterEach(() => vi.unstubAllEnvs());
  it('does nothing and says nothing when none of the three are set', () => {
    const { out, warn } = load({});
    expect(out).toEqual({ name: 'x' });
    expect(warn).not.toHaveBeenCalled();
  });
  it('names the missing ones when only some are set, and still leaves the build unchanged', () => {
    const { out, warn } = load({ SENTRY_ORG: 'o' });
    expect(out).toEqual({ name: 'x' });
    expect(String(warn.mock.calls[0]?.[0])).toContain('SENTRY_AUTH_TOKEN, SENTRY_PROJECT');
  });
  it('adds the plugin, without a warning, when all three are set', () => {
    const { out, warn } = load({ SENTRY_AUTH_TOKEN: 't', SENTRY_ORG: 'o', SENTRY_PROJECT: 'p' });
    expect(out.plugins).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('package', () => {
  it('lets a bundler drop what is not imported', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).sideEffects).toBe(false);
  });
});
