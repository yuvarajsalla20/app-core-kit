#!/usr/bin/env node
// The App Sheet check for every app on the kits (1.9.0).
//
// Every app keeps one APP.md, the App Sheet: what the app runs on and how it is configured. This check keeps it true to
// the code, so a version change can never leave it behind. It fails when:
// - APP.md is missing, or has no "Last reviewed" date;
// - the app version in APP.md is not the version in app.json;
// - the Kits table does not list every kit in package.json "kitVersions" with that exact version, or lists another kit;
// - a key in .env.example is not named in APP.md.
// Services, plans and owner switches cannot be read from the code; the app's CLAUDE.md rule covers those.
//
// In an app:  "check:app": "app-sheet-check"
// Or by path: node node_modules/app-core-kit/checkAppSheet.mjs [app folder]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** The rows of the first table under the heading whose text includes `title` (case does not matter), without the header. */
export const tableUnder = (sheet, title) => {
  const lines = sheet.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,4}\s/.test(l) && l.toLowerCase().includes(title.toLowerCase()));
  if (start < 0) return null;
  const rows = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,4}\s/.test(line)) break;
    if (line.trim().startsWith('|')) {
      inTable = true;
      rows.push(cells(line));
    } else if (inTable) break;
  }
  return rows.slice(2); // the header and the --- line
};

const plain = (s) => s.replace(/`/g, '').trim();

/** Every key name in a .env file (NAME=...), comments left out. */
export const envNames = (envText) =>
  envText
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/))
    .filter(Boolean)
    .map((m) => m[1]);

/** Whether APP.md names `key`, written out (`KEY`) or covered by a written prefix such as `EXPO_PUBLIC_FIREBASE_*`. */
export const namesKey = (sheet, key) => {
  if (new RegExp(`\\b${key}\\b`).test(sheet)) return true;
  return [...sheet.matchAll(/`([A-Z][A-Z0-9_]*)\*`/g)].some((m) => key.startsWith(m[1]));
};

/**
 * Every problem with one app's App Sheet. `sheet` is APP.md (null when missing), `pkg` package.json, `appVersion` the
 * version in app.json (null when unknown), `env` .env.example (null when the app has none).
 */
export const checkAppSheet = ({ sheet, pkg, appVersion, env }) => {
  if (sheet == null) return ['APP.md is missing. Copy the App Sheet template from app-starter-template and fill it in.'];
  const problems = [];
  if (!/\*\*Last reviewed:\*\*\s*\d{4}-\d{2}-\d{2}/.test(sheet)) problems.push('APP.md has no "**Last reviewed:** YYYY-MM-DD" line.');

  if (appVersion) {
    const app = tableUnder(sheet, 'The App') ?? [];
    const row = app.find((r) => plain(r[0] ?? '').toLowerCase() === 'version');
    if (!row) problems.push('APP.md "The App" table has no Version row.');
    else if (!new RegExp(`(^|[^\\d.])${appVersion.replace(/\./g, '\\.')}([^\\d.]|$)`).test(plain(row[1] ?? ''))) {
      problems.push(`APP.md says version "${plain(row[1] ?? '')}", but app.json is ${appVersion}. Update the Version row.`);
    }
  }

  const want = Object.fromEntries(Object.entries(pkg.kitVersions ?? {}).map(([k, v]) => [k, String(v).replace(/^v/, '')]));
  const rows = tableUnder(sheet, 'Kits');
  if (!rows) problems.push('APP.md has no "Kits" table.');
  else {
    const have = Object.fromEntries(rows.filter((r) => r.length >= 2).map((r) => [plain(r[0]), plain(r[1]).replace(/^v/, '')]));
    for (const [kit, version] of Object.entries(want)) {
      if (!(kit in have)) problems.push(`APP.md Kits table does not list ${kit} ${version}.`);
      else if (have[kit] !== version) problems.push(`APP.md lists ${kit} ${have[kit]}, but package.json is ${version}. Update the Kits table.`);
    }
    for (const kit of Object.keys(have)) {
      if (!(kit in want)) problems.push(`APP.md lists ${kit}, which is not in package.json "kitVersions". Remove the row.`);
    }
  }

  if (env != null) {
    for (const key of envNames(env)) {
      if (!namesKey(sheet, key)) problems.push(`.env.example has ${key}, but APP.md does not name it. Add it to "Keys and Secrets".`);
    }
  }
  return problems;
};

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

/** Runs the check in an app folder; returns the exit code. */
export const main = (dir = '.', log = console.log, error = console.error) => {
  const root = resolve(dir);
  const appJson = read(join(root, 'app.json'));
  const appVersion = appJson ? (JSON.parse(appJson).expo?.version ?? null) : null;
  const problems = checkAppSheet({
    sheet: read(join(root, 'APP.md')),
    pkg: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    appVersion,
    env: read(join(root, '.env.example')),
  });
  if (problems.length) {
    error(`App Sheet check failed:\n- ${problems.join('\n- ')}`);
    return 1;
  }
  log('APP.md matches the app version, the kits and the keys.');
  return 0;
};

const entry = process.argv[1];
const runningDirectly = entry && (import.meta.url === pathToFileURL(resolve(entry)).href || /app-sheet-check$/.test(entry));
if (runningDirectly) process.exit(main(process.argv[2]));
