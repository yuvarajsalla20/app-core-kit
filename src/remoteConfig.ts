import { useEffect, useState } from 'react';
import { reportError } from './report';

/**
 * Firebase Remote Config for React Native through Firebase's own REST endpoints (the web SDK needs IndexedDB, which
 * React Native does not have). Values are kept on the phone, so screens read them at once and offline; a new fetch
 * replaces them at most every `minFetchMs`.
 */
export type RemoteValues = Record<string, string>;

/** Where the client keeps its values and installation on the phone (for example, AsyncStorage). */
export interface RemoteConfigStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export interface RemoteConfigOptions {
  /** The Firebase web app's settings. When any is missing, `refresh` does nothing and the defaults are used. */
  firebase: { projectId?: string; apiKey?: string; appId?: string };
  storage: RemoteConfigStorage;
  /** The value of each key until Remote Config sends one. */
  defaults?: RemoteValues;
  /** Storage key names. Default `remoteConfig.cache` and `remoteConfig.installation`. */
  keys?: { cache?: string; installation?: string };
  /** The shortest time between two fetches, unless forced. Default one hour. */
  minFetchMs?: number;
  /** How long one request may take. Default 10 seconds. */
  timeoutMs?: number;
  /** Sent to Remote Config for language conditions. Default `en`. */
  languageCode?: string;
  /** Replaceable for tests. Default the global `fetch`. */
  fetch?: typeof fetch;
}

export interface RemoteConfig {
  /** Fetches new values when the kept ones are older than `minFetchMs` (or when `force`). Never throws. */
  refresh: (force?: boolean) => Promise<void>;
  /** The kept values now (empty until the phone's copy has loaded; `watch` says when it has). */
  values: () => RemoteValues;
  /** A value, or its default. */
  value: (values: RemoteValues, key: string) => string;
  /** When the kept values were fetched (milliseconds since 1970), 0 before the first fetch. */
  fetchedAt: () => number;
  /** Calls back with the kept values, then with new ones after each fetch. Returns the stop function. */
  watch: (onValues: (values: RemoteValues) => void) => () => void;
  /** An on/off switch: on unless the value is 'false'; null until the first values are read. */
  useFlag: (key: string) => boolean | null;
  /** A whole number of 0 or more, or `fallback` when missing, invalid or not read yet. */
  useLimit: (key: string, fallback: number) => number;
}

interface Kept {
  values: RemoteValues;
  fetchedAt: number;
}
interface Installation {
  fid: string;
  token: string;
  expiresAt: number;
}

/**
 * Random bytes: the platform's secure source where there is one, else Math.random (React Native's Hermes engine has no
 * `crypto` global). An installation id is not a secret, so either is fine here.
 */
const randomBytes = (n: number): Uint8Array => {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(n));
  return Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));
};

/** A Firebase installation id: 22 characters of URL-safe base64 whose first 4 bits are 0111 (Firebase's own rule). */
export function newInstallationId(random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(17);
  bytes[0] = 0b01110000 + (bytes[0]! % 0b10000);
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
  return b64.slice(0, 22);
}

export function createRemoteConfig(options: RemoteConfigOptions): RemoteConfig {
  const { firebase, storage, defaults = {}, minFetchMs = 60 * 60 * 1000, timeoutMs = 10_000, languageCode = 'en' } = options;
  const cacheKey = options.keys?.cache ?? 'remoteConfig.cache';
  const installKey = options.keys?.installation ?? 'remoteConfig.installation';
  const configured = !!(firebase.projectId && firebase.apiKey && firebase.appId);
  const listeners = new Set<(v: RemoteValues) => void>();
  let kept: Kept | null = null;

  /** A request that is cancelled after `timeoutMs`, so a stuck connection never holds the app. */
  const send = async (url: string, init: RequestInit) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      return await (options.fetch ?? fetch)(url, { ...init, signal: ctl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  async function load(): Promise<Kept> {
    if (kept) return kept;
    try {
      const raw = await storage.getItem(cacheKey);
      const parsed = raw ? (JSON.parse(raw) as Partial<Kept>) : null;
      kept = parsed && typeof parsed.values === 'object' && parsed.values ? { values: parsed.values, fetchedAt: Number(parsed.fetchedAt) || 0 } : { values: {}, fetchedAt: 0 };
    } catch {
      kept = { values: {}, fetchedAt: 0 };
    }
    return kept;
  }

  async function installation(): Promise<Installation> {
    const saved = await storage.getItem(installKey).catch(() => null);
    let known: Installation | null = null;
    try {
      known = saved ? (JSON.parse(saved) as Installation) : null;
    } catch {
      known = null;
    }
    if (known && known.expiresAt > Date.now() + 60_000) return known;
    const fid = known?.fid ?? newInstallationId();
    const res = await send(`https://firebaseinstallations.googleapis.com/v1/projects/${firebase.projectId}/installations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(firebase.apiKey) },
      body: JSON.stringify({ fid, appId: firebase.appId, authVersion: 'FIS_v2', sdkVersion: 'w:0.6.0' }),
    });
    if (!res.ok) throw new Error(`Installations ${res.status}`);
    const body = (await res.json()) as { fid?: string; authToken: { token: string; expiresIn: string } };
    const inst = { fid: body.fid ?? fid, token: body.authToken.token, expiresAt: Date.now() + parseInt(body.authToken.expiresIn, 10) * 1000 };
    await storage.setItem(installKey, JSON.stringify(inst));
    return inst;
  }

  async function refresh(force = false): Promise<void> {
    if (!configured) return;
    const now = await load();
    if (!force && Date.now() - now.fetchedAt < minFetchMs) return;
    try {
      const inst = await installation();
      const res = await send(`https://firebaseremoteconfig.googleapis.com/v1/projects/${firebase.projectId}/namespaces/firebase:fetch?key=${firebase.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_instance_id: inst.fid, app_instance_id_token: inst.token, app_id: firebase.appId, sdk_version: '0.6.0', language_code: languageCode }),
      });
      if (!res.ok) throw new Error(`Remote Config ${res.status}`);
      const body = (await res.json()) as { entries?: RemoteValues; state?: string };
      const next: Kept = { values: body.state === 'NO_TEMPLATE' ? {} : (body.entries ?? now.values), fetchedAt: Date.now() };
      kept = next;
      await storage.setItem(cacheKey, JSON.stringify(next));
      listeners.forEach((l) => l(next.values));
    } catch (e) {
      reportError('remote-config', e);
    }
  }

  const value = (values: RemoteValues, key: string): string => values[key] ?? defaults[key] ?? '';

  function watch(onValues: (v: RemoteValues) => void): () => void {
    listeners.add(onValues);
    void load().then((k) => listeners.has(onValues) && onValues(k.values));
    return () => void listeners.delete(onValues);
  }

  function useFlag(key: string): boolean | null {
    const [on, setOn] = useState<boolean | null>(null);
    useEffect(() => watch((v) => setOn(value(v, key) !== 'false')), [key]);
    return on;
  }

  function useLimit(key: string, fallback: number): number {
    const [n, setN] = useState(fallback);
    useEffect(
      () =>
        watch((v) => {
          const parsed = parseInt(value(v, key), 10);
          setN(Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback);
        }),
      [key, fallback],
    );
    return n;
  }

  return { refresh, values: () => kept?.values ?? {}, value, fetchedAt: () => kept?.fetchedAt ?? 0, watch, useFlag, useLimit };
}
