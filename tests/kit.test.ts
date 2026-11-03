import { afterEach, describe, expect, it, vi } from 'vitest';
import { retry, withTimeout } from '../src/async';
import { friendlyMessage, isNetworkError, isPermissionError } from '../src/messages';
import { capturesGlobalErrors, reportError, scrub, setReporter } from '../src/report';

afterEach(() => {
  setReporter(null);
  vi.useRealTimers();
});

describe('scrub', () => {
  it('removes emails and long numbers', () => {
    expect(scrub('failed for a.b+c@example.com acct 123456789')).toBe('failed for [email] acct [number]');
  });
  it('keeps short numbers', () => {
    expect(scrub('retry 3 of 5')).toBe('retry 3 of 5');
  });
});

describe('reportError', () => {
  it('sends a scrubbed error to the reporter', () => {
    const seen: string[] = [];
    setReporter((where, error) => seen.push(`${where}:${error.message}`));
    reportError('a', new Error('bad for me@x.com'));
    expect(seen).toEqual(['a:bad for [email]']);
  });
  it('sends the same error from the same place once in a short time', () => {
    const seen: string[] = [];
    setReporter((where) => seen.push(where));
    reportError('same', new Error('x'));
    reportError('same', new Error('x'));
    reportError('other', new Error('x'));
    expect(seen).toEqual(['same', 'other']);
  });
  it('accepts non-Error values and never throws, even if the reporter does', () => {
    setReporter(() => {
      throw new Error('reporter broke');
    });
    expect(() => reportError('weird', 'just a string')).not.toThrow();
  });
});

describe('withTimeout', () => {
  it('rejects when the task is too slow', async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise(() => undefined), 1000, 'too slow');
    const check = expect(slow).rejects.toThrow('too slow');
    await vi.advanceTimersByTimeAsync(1000);
    await check;
  });
  it('passes the result through when fast enough', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe('retry', () => {
  it('tries again until it works', async () => {
    let calls = 0;
    const result = await retry(async () => {
      if (++calls < 3) throw new Error('flaky');
      return 'ok';
    }, { baseMs: 1 });
    expect([result, calls]).toEqual(['ok', 3]);
  });
  it('gives up after the attempts and throws the last error', async () => {
    let calls = 0;
    await expect(retry(async () => { calls++; throw new Error('down'); }, { attempts: 2, baseMs: 1 })).rejects.toThrow('down');
    expect(calls).toBe(2);
  });
  it('does not retry errors that will never succeed', async () => {
    let calls = 0;
    await expect(retry(async () => { calls++; throw Object.assign(new Error('no'), { code: 'permission-denied' }); }, { baseMs: 1, shouldRetry: (e) => !isPermissionError(e) })).rejects.toThrow('no');
    expect(calls).toBe(1);
  });
});

describe('friendlyMessage', () => {
  it('says what to do for connection and permission errors', () => {
    expect(isNetworkError({ code: 'unavailable' })).toBe(true);
    expect(friendlyMessage(new Error('Network request failed'))).toMatch(/No connection/);
    expect(friendlyMessage({ code: 'permission-denied' })).toMatch(/access/);
    expect(friendlyMessage(new Error('boom'))).toMatch(/Something went wrong/);
  });
});

describe('scrub (wider)', () => {
  it.each([
    ['card 4111 1111 1111 1111 declined', 'card [number] declined'],
    ['card 4111-1111-1111-1111', 'card [number]'],
    ['call (469) 555-0199 now', 'call [number] now'],
    ['mail josé@exämple.com', 'mail [email]'],
    ['token ghp_abcdefghijklmnopqrstuvwx1234', 'token [token]'],
    ['jwt eyJhbGciOi.eyJzdWIiOiIx.sig_part ok', 'jwt [token] ok'],
  ])('%s', (input, expected) => expect(scrub(input)).toBe(expected));
  it('keeps ordinary long names and short numbers', () => {
    expect(scrub('at validateExpenseAmountAndCurrencyValue line 42')).toBe('at validateExpenseAmountAndCurrencyValue line 42');
  });
});

describe('start-up buffering and extra', () => {
  it('delivers reports made before the reporter was connected', () => {
    reportError('early', new Error('first boot problem'));
    const seen: string[] = [];
    setReporter((where) => seen.push(where));
    expect(seen).toEqual(['early']);
  });
  it('scrubs extra and where', () => {
    const seen: unknown[] = [];
    setReporter((where, _e, extra) => seen.push([where, extra]));
    reportError('screen a@b.co', new Error('x1'), { stack: 'for me@x.com', n: 5 });
    expect(seen).toEqual([['screen [email]', { stack: 'for [email]', n: 5 }]]);
  });
});

describe('capturesGlobalErrors', () => {
  it('is on only while a reporter that handles global errors is connected', () => {
    setReporter(() => undefined, { capturesGlobalErrors: true });
    expect(capturesGlobalErrors()).toBe(true);
    setReporter(null);
    expect(capturesGlobalErrors()).toBe(false);
  });
});
