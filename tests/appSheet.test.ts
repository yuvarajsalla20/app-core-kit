import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no types
import { checkAppSheet, envNames, main, namesKey, tableUnder } from '../checkAppSheet.mjs';

const SHEET = `# My App: App Sheet

**Last reviewed:** 2026-11-23

## 1. The App

| Item | Value |
| --- | --- |
| Name | My App |
| Version | 1.2.0 |

## 3. Kits

| Kit | Version |
| --- | --- |
| app-core-kit | 1.9.0 |
| \`app-settings-kit\` | 16.0.0 |

## 5. Keys and Secrets

| Name | Where it lives | What it is |
| --- | --- | --- |
| \`EXPO_PUBLIC_FIREBASE_*\` (six) | EAS | Firebase. |
| \`SENTRY_AUTH_TOKEN\` | EAS | Stack traces. |
`;
const PKG = { kitVersions: { 'app-core-kit': 'v1.9.0', 'app-settings-kit': 'v16.0.0' } };
const ENV = '# Firebase\nEXPO_PUBLIC_FIREBASE_API_KEY=\nEXPO_PUBLIC_FIREBASE_APP_ID=\nSENTRY_AUTH_TOKEN=\n';
const run = (over: Record<string, unknown> = {}) => checkAppSheet({ sheet: SHEET, pkg: PKG, appVersion: '1.2.0', env: ENV, ...over });

describe('App Sheet check', () => {
  it('passes when APP.md matches the app version, the kits and the keys', () => {
    expect(run()).toEqual([]);
  });

  it('fails without APP.md', () => {
    expect(run({ sheet: null })[0]).toMatch(/APP.md is missing/);
  });

  it('fails without a Last reviewed date', () => {
    expect(run({ sheet: SHEET.replace('**Last reviewed:** 2026-11-23', '') })).toEqual(['APP.md has no "**Last reviewed:** YYYY-MM-DD" line.']);
  });

  it('fails when the app version moved on', () => {
    expect(run({ appVersion: '1.3.0' })[0]).toMatch(/app.json is 1.3.0/);
    expect(run({ appVersion: '1.2.0' })).toEqual([]);
    expect(run({ appVersion: '1.2' })[0]).toMatch(/app.json is 1.2\b/);
  });

  it('fails when a kit version changed, a kit is missing or a kit was removed', () => {
    expect(run({ pkg: { kitVersions: { ...PKG.kitVersions, 'app-settings-kit': 'v16.1.0' } } })).toEqual(['APP.md lists app-settings-kit 16.0.0, but package.json is 16.1.0. Update the Kits table.']);
    expect(run({ pkg: { kitVersions: { ...PKG.kitVersions, 'app-theme-kit': 'v1.2.0' } } })).toEqual(['APP.md Kits table does not list app-theme-kit 1.2.0.']);
    expect(run({ pkg: { kitVersions: { 'app-core-kit': 'v1.9.0' } } })).toEqual(['APP.md lists app-settings-kit, which is not in package.json "kitVersions". Remove the row.']);
  });

  it('fails when a key in .env.example is not named', () => {
    expect(run({ env: `${ENV}EXPO_PUBLIC_SENTRY_DSN=\n` })).toEqual(['.env.example has EXPO_PUBLIC_SENTRY_DSN, but APP.md does not name it. Add it to "Keys and Secrets".']);
    expect(run({ env: null })).toEqual([]);
  });

  it('reads tables, key names and prefixes', () => {
    expect(tableUnder(SHEET, 'kits')).toEqual([
      ['app-core-kit', '1.9.0'],
      ['`app-settings-kit`', '16.0.0'],
    ]);
    expect(tableUnder(SHEET, 'Nothing')).toBeNull();
    expect(envNames('# A=1\nA_B=\n  C= x\nlower=1\n')).toEqual(['A_B', 'C']);
    expect(namesKey(SHEET, 'EXPO_PUBLIC_FIREBASE_PROJECT_ID')).toBe(true);
    expect(namesKey(SHEET, 'EXPO_PUBLIC_RC_IOS_KEY')).toBe(false);
  });

  it('runs on an app folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sheet-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify(PKG));
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { version: '1.2.0' } }));
    writeFileSync(join(dir, '.env.example'), ENV);
    writeFileSync(join(dir, 'APP.md'), SHEET);
    const out: string[] = [];
    expect(main(dir, (l: string) => out.push(l), (l: string) => out.push(l))).toBe(0);
    writeFileSync(join(dir, 'app.json'), JSON.stringify({ expo: { version: '2.0.0' } }));
    expect(main(dir, (l: string) => out.push(l), (l: string) => out.push(l))).toBe(1);
    expect(out.at(-1)).toMatch(/app.json is 2.0.0/);
  });
});
