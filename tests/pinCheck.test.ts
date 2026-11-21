import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain Node script, no types
import { checkKits, commitOfTag, isKit, main, parsePin, standardPin } from '../checkKitPins.mjs';

const SHA = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const pin = (repo: string, sha = SHA) => `git+https://github.com/yuvarajsalla20/${repo}.git#${sha}`;
const tags = (map: Record<string, string>) => (repo: string, tag: string) => {
  const sha = map[`${repo}@${tag}`];
  return sha ? `${sha}\trefs/tags/${tag}\n` : '';
};

describe('kit pin check', () => {
  it('knows kits by name', () => {
    expect(isKit('app-settings-kit')).toBe(true);
    expect(isKit('app-guard-kit')).toBe(true);
    expect(isKit('expo')).toBe(false);
  });

  it('reads only the standard git+https pin with a full SHA', () => {
    expect(parsePin(pin('app-core-kit'))).toEqual({ repo: 'yuvarajsalla20/app-core-kit', sha: SHA });
    expect(parsePin(`https://codeload.github.com/yuvarajsalla20/app-core-kit/tar.gz/${SHA}`)).toBeNull();
    expect(parsePin('git+https://github.com/yuvarajsalla20/app-core-kit.git#abc1234')).toBeNull();
    expect(parsePin('^1.0.0')).toBeNull();
    expect(standardPin('o/app-x-kit', SHA)).toBe(pin('app-x-kit').replace('yuvarajsalla20', 'o'));
  });

  it('takes the commit of an annotated tag from its ^{} line', () => {
    expect(commitOfTag(`${OTHER}\trefs/tags/v1\n${SHA}\trefs/tags/v1^{}\n`)).toBe(SHA);
    expect(commitOfTag('')).toBeNull();
  });

  it('passes when every kit is pinned to its tag', () => {
    const r = checkKits(
      { dependencies: { 'app-core-kit': pin('app-core-kit'), expo: '~58.0.0' }, kitVersions: { 'app-core-kit': 'v1.8.0' } },
      tags({ 'yuvarajsalla20/app-core-kit@v1.8.0': SHA }),
    );
    expect(r.problems).toEqual([]);
    expect(r.ok).toEqual(['ok  app-core-kit v1.8.0 aaaaaaa']);
    expect(r.count).toBe(1);
  });

  it('fails on every non-standard pin and says the fix', () => {
    const r = checkKits(
      {
        dependencies: {
          'app-core-kit': `https://codeload.github.com/yuvarajsalla20/app-core-kit/tar.gz/${SHA}`,
          'app-auth-kit': '^1.0.0',
          'app-account-kit': pin('app-account-kit', OTHER),
          'app-export-kit': pin('app-export-kit'),
          'app-theme-kit': pin('app-theme-kit'),
        },
        kitVersions: { 'app-account-kit': 'v7.0.0', 'app-export-kit': 'v9.9.9', 'app-gone-kit': 'v1.0.0' },
      },
      tags({ 'yuvarajsalla20/app-account-kit@v7.0.0': SHA }),
    );
    expect(r.problems).toEqual([
      `app-core-kit: uses a codeload tarball. Use the standard pin: "${pin('app-core-kit')}" (full 40-character SHA).`,
      'app-auth-kit: "^1.0.0" is not the standard pin. Use "git+https://github.com/<owner>/app-auth-kit.git#<full SHA of the tag>".',
      'app-account-kit: pinned to bbbbbbb but v7.0.0 is aaaaaaa. Re-pin to ' + SHA + ' or fix "kitVersions".',
      'app-export-kit: tag v9.9.9 does not exist in yuvarajsalla20/app-export-kit. Merge the kit PR so it tags itself, or fix "kitVersions".',
      'app-theme-kit: no entry in "kitVersions". Add the tag this commit belongs to.',
      'app-gone-kit: listed in "kitVersions" but not in dependencies.',
    ]);
  });

  it('runs on a package.json file and returns the exit code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pins-'));
    const file = join(dir, 'package.json');
    writeFileSync(file, JSON.stringify({ dependencies: { react: '19.3.0' } }));
    const lines: string[] = [];
    expect(main(file, (l: string) => lines.push(l), (l: string) => lines.push(l))).toBe(0);
    expect(lines.at(-1)).toContain('All 0 kits');
  });

  it('is published as a bin and an entry', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.bin['app-kit-pins']).toBe('checkKitPins.mjs');
    expect(pkg.exports['./pin-check']).toBe('./checkKitPins.mjs');
    expect(pkg.files).toContain('checkKitPins.mjs');
    expect(readFileSync(new URL('../checkKitPins.mjs', import.meta.url), 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });
});
