# Changelog

Upgrade notes for app-core-kit, newest first. Each version is tagged in git (`v1.6.1`).

## 1.10.1

Nothing breaks. `createRemoteConfig` now works on React Native without a `crypto` polyfill: the installation id uses the platform's secure random source where there is one, and `Math.random` otherwise (Hermes has no `crypto` global). Before this, the first fetch failed on such a phone.

## 1.10.0

Nothing breaks. Two additions:

- `createRemoteConfig` brings Firebase Remote Config to React Native apps without a native module, through Firebase's REST endpoints. Values are kept on the phone, read at once and offline, and fetched at most hourly. It includes the `useFlag` and `useLimit` hooks for owner switches and limits. PAL's own client moves here.
- `toCsv`, `CSV_BOM`, `escapeHtml`, `withAlpha` and `useShallowStable`: the helpers that several kits had copied, kept here once. The kits switch to these in their next versions and delete their copies.

## 1.9.0

Nothing breaks. A second check for every app, `app-sheet-check`, keeps each app's `APP.md` (the App Sheet) true to the code: the app version from `app.json`, every kit and version from `kitVersions`, and every key name in `.env.example`. Add `"check:app": "app-sheet-check"` and run it in CI after `check:kits`. See "App Sheet check" in the README.

## 1.8.0

Nothing breaks. The kit pin check moves into the kit, so every app runs the same one: set `"check:kits": "app-kit-pins"` and delete the app's own `scripts/checkKitTags.mjs`. Run it after `npm ci`.

There is now one pin format for every kit: `git+https://github.com/<owner>/<kit>.git#<full SHA>`. The check fails on codeload tarballs, short SHAs, branches and npm ranges, and prints the standard pin to use. It also checks kits that are not in package.json's `kitVersions` yet, and every `app-*-kit`, not only the GitHub-pinned ones.

## 1.7.0

Nothing breaks. The built-in crash screen can now offer a way out: pass `onSignOut` to `ErrorBoundary` and it shows a "Log Out" button (the same words as the other kits) under "Try Again". Once sign-out finishes, the content is tried again, now signed out; if sign-out fails, the screen stays and the failure is reported. Both apps can now drop their own CrashScreen copies and the `fallback` prop (see below). The built-in words are now in Title Case: "Something Went Wrong", "Try Again", and the new `strings.signOut` ("Log Out").

More secrets are hidden: the plain `password: hunter2`, `token: abc`, `api_key: …`, `private_key: …` form (the reports only caught `key=value` and quoted JSON before), and whole PEM private key blocks.

`metro.config.js` is now explained in the README ("Readable crash stacks"), and `withMonitoring` warns during a Sentry build when the app has no `metro.config.js` using `app-core-kit/metro`. Without it, uploaded source maps cannot be matched and crash stacks stay unreadable.

To adopt in an app: replace `fallback={(error, reset) => <CrashScreen … />}` with `strings={{ retry: 'Back to Home' }}`, `onSignOut={signedIn ? signOut : undefined}` and the app's `colors`, then delete `src/components/CrashScreen.tsx`. HringNring also needs `metro.config.js` with `module.exports = require('app-core-kit/metro').monitoringMetroConfig(__dirname);`.

## 1.6.1

Nothing breaks. In development an unhandled promise rejection shows React Native's yellow warning again (the kit's tracker had replaced it); release builds behave as before.

## 1.6.0

Nothing breaks. New `strings` and `resetKeys` on `ErrorBoundary`; more secret shapes are hidden; a release such as `com.app@1.2.0+45` is no longer mistaken for an email address; the reporter keeps working if the phone's clock is set back; `sideEffects: false`. Dates in messages are still hidden (they may be a birth date).

## 1.5.0

`startMonitoring` now resolves a boolean instead of nothing. A timeout now says `TIMEOUT_MESSAGE` ("That took too long") instead of "No connection", and `isNetworkError` no longer matches the bare words "network" or "offline". New: `TimeoutError`, `isTimeoutError`, `TIMEOUT_MESSAGE`.
