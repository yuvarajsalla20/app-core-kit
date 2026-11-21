#!/usr/bin/env node
// The one kit pin check for every app on the kits.
//
// Every kit in an app's package.json must be pinned the standard way,
//   "app-x-kit": "git+https://github.com/<owner>/app-x-kit.git#<full SHA>"
// and that SHA must be the commit of the tag written in "kitVersions":
//   "kitVersions": { "app-x-kit": "v1.2.0" }
// It fails when a tag is missing, when the pin points at another commit, when
// a kit has no "kitVersions" entry, or when a kit uses another pin format
// (a codeload tarball, a branch, or an npm range).
//
// In an app:  "check:kits": "app-kit-pins"   (run it after npm ci)
// Or by path: node node_modules/app-core-kit/checkKitPins.mjs [package.json]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Kits are the packages named app-<name>-kit. */
export const isKit = (name) => /^app-[a-z0-9-]+-kit$/.test(name);

const STANDARD = /^git\+https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*?)(?:\.git)?#([0-9a-f]{40})$/;
/** A release tag: v1.2.3, with an optional -beta.1 style suffix. Nothing else reaches git. */
export const isTag = (tag) => typeof tag === 'string' && /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(tag);
const CODELOAD = /^https:\/\/codeload\.github\.com\/([^/]+\/[^/]+)\/tar\.gz\/([0-9a-f]{7,40})$/;

/** The GitHub repo ("owner/name") and commit a kit is pinned to, or null when it is not the standard pin. */
export const parsePin = (spec) => {
  if (typeof spec !== 'string') return null;
  const m = spec.match(STANDARD);
  return m ? { repo: m[1], sha: m[2] } : null;
};

/** The standard pin for a repo and commit. */
export const standardPin = (repo, sha) => `git+https://github.com/${repo}.git#${sha}`;

/** The commit a tag points at, read from `git ls-remote` output (an annotated tag lists its commit on the ^{} line). */
export const commitOfTag = (lsRemote) => {
  const lines = lsRemote.trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
  if (lines.length === 0) return null;
  return (lines.find(([, ref]) => ref.endsWith('^{}')) ?? lines[0])[0];
};

// Only a checked repo and tag reach git, after "--", so nothing read from package.json can become a git option.
const lsRemote = (repo, tag) =>
  execFileSync('git', ['ls-remote', '--tags', '--', `https://github.com/${repo}.git`, `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8' });

/** Every problem with the kit pins of one package.json, plus a line for each kit that is fine. `readTags` is git ls-remote (replaced in tests). */
export const checkKits = (pkg, readTags = lsRemote) => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const kitVersions = pkg.kitVersions ?? {};
  const problems = [];
  const ok = [];
  const kits = Object.keys(deps).filter(isKit);

  for (const name of kits) {
    const spec = deps[name];
    const pin = parsePin(spec);
    if (!pin) {
      const old = typeof spec === 'string' ? spec.match(CODELOAD) : null;
      problems.push(
        old
          ? `${name}: uses a codeload tarball. Use the standard pin: "${standardPin(old[1], old[2])}" (full 40-character SHA).`
          : `${name}: "${spec}" is not the standard pin. Use "git+https://github.com/<owner>/${name}.git#<full SHA of the tag>".`,
      );
      continue;
    }
    const tag = kitVersions[name];
    if (!tag) {
      problems.push(`${name}: no entry in "kitVersions". Add the tag this commit belongs to.`);
      continue;
    }
    if (!isTag(tag)) {
      problems.push(`${name}: "${tag}" in "kitVersions" is not a release tag such as v1.2.0.`);
      continue;
    }
    let out = '';
    try {
      out = readTags(pin.repo, tag);
    } catch (e) {
      problems.push(`${name}: could not read tags from ${pin.repo} (${String(e.message).split('\n')[0]}).`);
      continue;
    }
    const commit = commitOfTag(out);
    if (!commit) {
      problems.push(`${name}: tag ${tag} does not exist in ${pin.repo}. Merge the kit PR so it tags itself, or fix "kitVersions".`);
      continue;
    }
    if (commit !== pin.sha) {
      problems.push(`${name}: pinned to ${pin.sha.slice(0, 7)} but ${tag} is ${commit.slice(0, 7)}. Re-pin to ${commit} or fix "kitVersions".`);
    } else {
      ok.push(`ok  ${name} ${tag} ${commit.slice(0, 7)}`);
    }
  }

  for (const name of Object.keys(kitVersions)) {
    if (!kits.includes(name)) problems.push(`${name}: listed in "kitVersions" but not in dependencies.`);
  }
  return { problems, ok, count: kits.length };
};

/** Runs the check on a package.json file; returns the exit code. */
export const main = (file = 'package.json', log = console.log, error = console.error) => {
  const { problems, ok, count } = checkKits(JSON.parse(readFileSync(resolve(file), 'utf8')));
  ok.forEach((line) => log(line));
  if (problems.length) {
    error(`\nKit pin check failed:\n- ${problems.join('\n- ')}`);
    return 1;
  }
  log(`\nAll ${count} kits are pinned to their tags.`);
  return 0;
};

const entry = process.argv[1];
const runningDirectly = entry && (import.meta.url === pathToFileURL(resolve(entry)).href || /app-kit-pins$/.test(entry));
if (runningDirectly) process.exit(main(process.argv[2]));
