import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRemoteConfig, newInstallationId, type RemoteConfigStorage } from '../src/remoteConfig';
import { setReporter } from '../src/report';

const firebase = { projectId: 'p', apiKey: 'k', appId: 'a' };
let stored: Map<string, string>;
const storage: RemoteConfigStorage = { getItem: async (k) => stored.get(k) ?? null, setItem: async (k, v) => void stored.set(k, v) };
const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;

/** A fake Firebase: the installations call, then the Remote Config call with `entries`. */
function server(entries: Record<string, string> | 'fail' | 'none') {
  return vi.fn(async (url: string) => {
    if (url.includes('installations')) return json({ fid: 'f1', authToken: { token: 't', expiresIn: '3600s' } });
    if (entries === 'fail') return json({}, false, 500);
    return json(entries === 'none' ? { state: 'NO_TEMPLATE' } : { entries });
  });
}

beforeEach(() => {
  stored = new Map();
  setReporter(null);
});

describe('createRemoteConfig', () => {
  it('fetches, keeps the values on the phone and tells every watcher', async () => {
    const fetch = server({ flag: 'false', limit: '3' });
    const rc = createRemoteConfig({ firebase, storage, fetch: fetch as unknown as typeof globalThis.fetch });
    const seen: Record<string, string>[] = [];
    rc.watch((v) => seen.push(v));
    await rc.refresh();
    expect(rc.values()).toEqual({ flag: 'false', limit: '3' });
    expect(seen.at(-1)).toEqual({ flag: 'false', limit: '3' });
    expect(rc.fetchedAt()).toBeGreaterThan(0);
    // A second copy (the next app start) reads them from the phone without a request.
    const next = createRemoteConfig({ firebase, storage, fetch: server('fail') as unknown as typeof globalThis.fetch });
    const first = await new Promise((resolve) => next.watch(resolve));
    expect(first).toEqual({ flag: 'false', limit: '3' });
  });

  it('fetches at most once an hour unless forced', async () => {
    const fetch = server({ a: '1' });
    const rc = createRemoteConfig({ firebase, storage, fetch: fetch as unknown as typeof globalThis.fetch });
    await rc.refresh();
    await rc.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    await rc.refresh(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps the old values and reports when a fetch fails, and never throws', async () => {
    stored.set('remoteConfig.cache', JSON.stringify({ values: { a: '1' }, fetchedAt: 1 }));
    const reports: unknown[] = [];
    setReporter((e) => void reports.push(e));
    const rc = createRemoteConfig({ firebase, storage, fetch: server('fail') as unknown as typeof globalThis.fetch });
    await expect(rc.refresh()).resolves.toBeUndefined();
    expect(rc.values()).toEqual({ a: '1' });
    expect(reports).toHaveLength(1);
  });

  it('empties the values when the project has no template', async () => {
    stored.set('remoteConfig.cache', JSON.stringify({ values: { a: '1' }, fetchedAt: 1 }));
    const rc = createRemoteConfig({ firebase, storage, fetch: server('none') as unknown as typeof globalThis.fetch });
    await rc.refresh();
    expect(rc.values()).toEqual({});
  });

  it('does nothing without Firebase settings, and falls back to the defaults', async () => {
    const fetch = server({ a: '1' });
    const rc = createRemoteConfig({ firebase: { projectId: 'p' }, storage, defaults: { a: '9' }, fetch: fetch as unknown as typeof globalThis.fetch });
    await rc.refresh(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(rc.value(rc.values(), 'a')).toBe('9');
    expect(rc.value({}, 'missing')).toBe('');
  });

  it('survives a damaged phone copy', async () => {
    stored.set('remoteConfig.cache', '{not json');
    const rc = createRemoteConfig({ firebase, storage, fetch: server({ a: '1' }) as unknown as typeof globalThis.fetch });
    const first = await new Promise((resolve) => rc.watch(resolve));
    expect(first).toEqual({});
  });
});

describe('newInstallationId', () => {
  it('is 22 URL-safe characters starting with the 0111 bits', () => {
    const id = newInstallationId(() => new Uint8Array(17).fill(255));
    expect(id).toHaveLength(22);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(id[0]).toBe('f');
  });
});

describe('newInstallationId without crypto (1.10.1)', () => {
  it('falls back to Math.random when the platform has no crypto global', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const id = newInstallationId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
    }
  });
});
