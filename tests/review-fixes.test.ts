import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', StyleSheet: { create: <T,>(x: T) => x }, Text: 'Text', View: 'View' }));

// The reporter keeps state (a queue, a per-minute count), so every test gets a fresh copy of the modules.
type Async = typeof import('../src/async');
type Messages = typeof import('../src/messages');
type Monitoring = typeof import('../src/monitoring');
type Report = typeof import('../src/report');
let TimeoutError: Async['TimeoutError'], isTimeoutError: Async['isTimeoutError'], retry: Async['retry'], withTimeout: Async['withTimeout'];
let ErrorBoundary: typeof import('../src/ErrorBoundary').ErrorBoundary;
let kit: typeof import('../src/index');
let FALLBACK_MESSAGE: Messages['FALLBACK_MESSAGE'], NO_CONNECTION_MESSAGE: Messages['NO_CONNECTION_MESSAGE'], TIMEOUT_MESSAGE: Messages['TIMEOUT_MESSAGE'];
let friendlyMessage: Messages['friendlyMessage'], isNetworkError: Messages['isNetworkError'];
let scrubEvent: Monitoring['scrubEvent'];
let reportError: Report['reportError'], scrub: Report['scrub'], setReporter: Report['setReporter'];

beforeEach(async () => {
  vi.resetModules();
  ({ TimeoutError, isTimeoutError, retry, withTimeout } = await import('../src/async'));
  ({ ErrorBoundary } = await import('../src/ErrorBoundary'));
  kit = await import('../src/index');
  ({ FALLBACK_MESSAGE, NO_CONNECTION_MESSAGE, TIMEOUT_MESSAGE, friendlyMessage, isNetworkError } = await import('../src/messages'));
  ({ scrubEvent } = await import('../src/monitoring'));
  ({ reportError, scrub, setReporter } = await import('../src/report'));
});

afterEach(() => {
  setReporter(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('scrub: more kinds of personal data', () => {
  it.each([
    ['GET https://api.x.com/me?token=abc123 failed', 'GET https://api.x.com/me?[query] failed'],
    ['sent Bearer abc.def.ghi to server', 'sent Bearer [token] to server'],
    ['password=hunter2 rejected', 'password=[secret] rejected'],
    ['apikey=abc12345', 'apikey=[secret]'],
    ['from 192.168.1.20 failed', 'from [ip] failed'],
    ['peer fe80::1ff:fe23:4567:890a', 'peer [ip]'],
    ['file /Users/yuvaraj/app/index.js', 'file [home]/app/index.js'],
    ['C:\\Users\\yuva\\app.js', '[home]\\app.js'],
    ['card 4111.1111.1111.1111', 'card [number]'],
    ['card 4111/1111/1111/1111', 'card [number]'],
    ['card 4111\u00a01111\u00a01111\u00a01111', 'card [number]'],
    ['card ٤١١١١١١١١١١١١١١١', 'card [number]'],
    ['id 0123456789abcdef0123456789abcdef', 'id [token]'],
    ['jwt eyJhbGciOi.eyJzdWIiOiIx', 'jwt [token]'],
    ['push ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', 'push [token]'],
  ])('%s', (input, expected) => expect(scrub(input)).toBe(expected));

  it('keeps a scoped package path and plain times', () => {
    expect(scrub('at /app/node_modules/@react-navigation/native/src/useLinking.js:10:5')).toBe('at /app/node_modules/@react-navigation/native/src/useLinking.js:10:5');
    expect(scrub('at 12:30:45 today')).toBe('at 12:30:45 today');
  });
  it('still scrubs real addresses, with or without a trailing slash', () => {
    expect(scrub('me@x.com and /u/jo@x.com/app.js')).toBe('[email] and /u/[email]/app.js');
  });
  it('stays fast on hostile input', () => {
    const start = Date.now();
    for (const piece of ['a-', '@', '1.', '(', 'eyJ', ':']) scrub(piece.repeat(5000));
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('scrubEvent', () => {
  it('replaces anything nested too deep instead of letting it through', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'bob@x.com' } } } } } } } } } };
    const out = scrubEvent({ extra: deep });
    expect(JSON.stringify(out)).not.toContain('bob@x.com');
    expect(JSON.stringify(out)).toContain('[truncated]');
  });
  it('scrubs the fields it did not list before, and keys, and removes the machine and phone names', () => {
    const out = scrubEvent({
      transaction: '/profile/bob@x.com',
      server_name: 'Yuvarajs-MacBook',
      release: 'app@1.0.0',
      extra: { 'bob@x.com': 'v' },
      contexts: { device: { name: "Yuvaraj's iPhone", model: 'iPhone15' } },
      event_id: 'abc',
      debug_meta: { images: [{ debug_id: 'x' }] },
    }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/bob@x\.com|MacBook|Yuvaraj/);
    expect(out.server_name).toBeUndefined();
    expect(out.event_id).toBe('abc');
    expect(out.debug_meta).toEqual({ images: [{ debug_id: 'x' }] });
    expect(text).toContain('iPhone15');
  });
});

describe('reportError: flood protection and detail', () => {
  it('counts 50+ different errors without forgetting the recent ones', () => {
    const seen: string[] = [];
    setReporter((w) => seen.push(w));
    for (let i = 0; i < 25; i++) reportError(`p${i}`, new Error('x'));
    const before = seen.length;
    reportError('p24', new Error('x')); // repeat of a recent error within the gap
    expect(seen.length).toBe(before);
  });
  it('treats a message that only changes its numbers as the same error', () => {
    const seen: string[] = [];
    setReporter((w) => seen.push(w));
    for (let i = 0; i < 10; i++) reportError('loop', new Error(`failed item ${i}`));
    expect(seen).toEqual(['loop']);
  });
  it('sends at most 30 a minute and says how many it held back', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const extras: unknown[] = [];
    setReporter((_w, _e, extra) => extras.push(extra));
    for (let i = 0; i < 45; i++) reportError(`place-${i}`, new Error('boom'));
    expect(extras.length).toBe(30);
    vi.advanceTimersByTime(61_000);
    reportError('after', new Error('boom'));
    expect(extras.length).toBe(31);
    expect(extras[30]).toEqual({ heldBack: 15 });
  });
  it('keeps the error code and a scrubbed cause', () => {
    const seen: Error[] = [];
    setReporter((_w, e) => seen.push(e));
    reportError('c', Object.assign(new Error('top', { cause: new Error('under me@x.com') }), { code: 'permission-denied' }));
    const err = seen[0] as Error & { code?: string; cause?: Error };
    expect(err.code).toBe('permission-denied');
    expect(err.cause?.message).toBe('under [email]');
  });
  it('tells the crash service when early reports were dropped', () => {
    for (let i = 0; i < 25; i++) reportError(`early-${i}`, new Error('boom'));
    const seen: [string, string][] = [];
    setReporter((w, e) => seen.push([w, e.message]));
    expect(seen.filter(([w]) => w.startsWith('early-')).length).toBe(20);
    expect(seen.at(-1)?.[0]).toBe('reporter');
    expect(seen.at(-1)?.[1]).toMatch(/5 reports/);
  });
});

describe('withTimeout and retry', () => {
  it('rejects with a typed timeout error', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise(() => undefined), 100);
    const check = expect(slow).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(isTimeoutError(new TimeoutError())).toBe(true);
    expect(isTimeoutError({ code: 'timeout' })).toBe(true);
    expect(isTimeoutError(new Error('Timed out'))).toBe(false);
  });
  it('refuses a nonsense time instead of failing at once', async () => {
    for (const ms of [NaN, -5, '5' as unknown as number]) await expect(withTimeout(Promise.resolve(1), ms)).rejects.toBeInstanceOf(RangeError);
  });
  it('waits the longest a timer can for a huge number', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await withTimeout(Promise.resolve(1), 3e9);
    expect(spy.mock.calls[0][1]).toBe(2 ** 31 - 1);
  });
  it('refuses attempts that never end', async () => {
    await expect(retry(async () => 1, { attempts: NaN })).rejects.toBeInstanceOf(RangeError);
    await expect(retry(async () => 1, { attempts: Infinity })).rejects.toBeInstanceOf(RangeError);
  });
  it('never waits longer than maxMs', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const run = retry(async () => { calls++; throw new Error('x'); }, { attempts: 12, baseMs: 1000, maxMs: 2000, jitter: false }).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(2000 * 12);
    await run;
    expect(calls).toBe(12);
  });
  it('runs once for 0 attempts', async () => {
    let calls = 0;
    await expect(retry(async () => { calls++; throw new Error('x'); }, { attempts: 0 })).rejects.toThrow('x');
    expect(calls).toBe(1);
  });
});

describe('messages', () => {
  it('does not call ordinary bugs a lost connection', () => {
    for (const text of ['Invalid network config', 'offline mode setting missing', "Cannot read property 'offlineQueue'", 'Payment timed out? card declined', 'Timed out']) {
      expect(isNetworkError(new Error(text))).toBe(false);
      expect(friendlyMessage(new Error(text))).toBe(FALLBACK_MESSAGE);
    }
  });
  it('still recognises real connection failures', () => {
    for (const text of ['Network request failed', 'Network request timed out', 'You are offline', 'The Internet connection appears to be offline']) {
      expect(friendlyMessage(new Error(text))).toBe(NO_CONNECTION_MESSAGE);
    }
  });
  it('says "took too long" for a timeout', () => {
    expect(friendlyMessage(new TimeoutError())).toBe(TIMEOUT_MESSAGE);
  });
});

describe('ErrorBoundary', () => {
  const make = (props: Record<string, unknown> = {}) => {
    const b = new ErrorBoundary({ where: 'home', children: 'kids', ...props } as never);
    b.setState = ((s: { error: unknown }) => { b.state = s; }) as never;
    return b;
  };
  it('turns a thrown null or undefined into a real error, and keeps other falsy values', () => {
    expect(ErrorBoundary.getDerivedStateFromError(null).error).toBeInstanceOf(Error);
    expect(ErrorBoundary.getDerivedStateFromError(undefined).error).toBeInstanceOf(Error);
    expect(ErrorBoundary.getDerivedStateFromError(0).error).toBe(0);
  });
  it('shows its children until something is caught, then the calm screen or the fallback', () => {
    const b = make();
    expect(b.render()).toBe('kids');
    b.state = { error: new Error('x') };
    expect(b.render()).not.toBe('kids');
    const withFallback = make({ fallback: (e: unknown) => `fallback:${(e as Error).message}` });
    withFallback.state = { error: new Error('x') };
    expect(withFallback.render()).toBe('fallback:x');
  });
  it('reports the screen name and a scrubbed, shortened component stack', () => {
    const seen: [string, Record<string, unknown> | undefined][] = [];
    setReporter((w, _e, extra) => seen.push([w, extra]));
    make().componentDidCatch(new Error('x'), { componentStack: `at me@x.com ${'y'.repeat(900)}` } as never);
    expect(seen[0][0]).toBe('home');
    const stack = String(seen[0][1]?.componentStack);
    expect(stack).toContain('[email]');
    expect(stack.length).toBeLessThanOrEqual(500);
  });
  it('runs onReset first, then clears the error, even if onReset throws', () => {
    const order: string[] = [];
    const b = make({ onReset: () => { order.push('onReset'); throw new Error('bad reset'); } });
    b.state = { error: new Error('x') };
    b.reset();
    expect(order).toEqual(['onReset']);
    expect(b.state.error).toBeNull();
  });
});

describe('the exports every app imports', () => {
  it('keeps every name', () => {
    expect(Object.keys(kit).sort()).toEqual([
      'ErrorBoundary', 'FALLBACK_MESSAGE', 'KIT_NAME', 'KIT_VERSION', 'NO_CONNECTION_MESSAGE', 'TIMEOUT_MESSAGE', 'TimeoutError',
      'friendlyMessage', 'installGlobalHandler', 'isNetworkError', 'isPermissionError', 'isTimeoutError', 'reportError', 'retry',
      'scrub', 'scrubEvent', 'setReporter', 'sleep', 'startMonitoring', 'withTimeout',
    ]);
  });
});
