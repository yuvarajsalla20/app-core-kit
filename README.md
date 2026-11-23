# app-core-kit

The non-functional basics every React Native and Expo app needs (iOS, Android and web): an error boundary, a global error handler, privacy-safe crash reporting with Sentry, timeouts and retries, and friendly error text. No native dependencies of its own and nothing specific to any one app.

**Current version: 1.9.0** (tag `v1.9.0`)

Part of the shared kits:
**app-core-kit** ·
[app-auth-kit](https://github.com/yuvarajsalla20/app-auth-kit) ·
[app-account-kit](https://github.com/yuvarajsalla20/app-account-kit) ·
[app-settings-kit](https://github.com/yuvarajsalla20/app-settings-kit) ·
[app-subscriptions-kit](https://github.com/yuvarajsalla20/app-subscriptions-kit) ·
[app-payments-kit](https://github.com/yuvarajsalla20/app-payments-kit) ·
[app-export-kit](https://github.com/yuvarajsalla20/app-export-kit) ·
[app-guard-kit](https://github.com/yuvarajsalla20/app-guard-kit) ·
[app-theme-kit](https://github.com/yuvarajsalla20/app-theme-kit) ·
[app-invite-kit](https://github.com/yuvarajsalla20/app-invite-kit) ·
[app-goldrates-api-kit](https://github.com/yuvarajsalla20/app-goldrates-api-kit)

Tools that work alongside them: [code-review-kit](https://github.com/yuvarajsalla20/code-review-kit) (reviews) and app-insights-kit (store numbers, private).

The other kits use it for `reportError`, so install it in every app.

## Install

```jsonc
// package.json
"dependencies": {
  "app-core-kit": "git+https://github.com/yuvarajsalla20/app-core-kit.git#<full SHA of v1.9.0>"
},
"kitVersions": {
  "app-core-kit": "v1.9.0"
}
```

Pin the full commit SHA of a release tag, and write the tag in `kitVersions`. Find a SHA with `git ls-remote https://github.com/yuvarajsalla20/app-core-kit refs/tags/v1.9.0`.

**Peer dependencies:** `react` ≥ 18, `react-native` ≥ 0.74, and optionally `@sentry/react-native` ≥ 8 (only for crash reports; it loads only when a DSN is set).

## Entry points

| Import | What it holds |
|---|---|
| `app-core-kit` | Everything below that runs in the app |
| `app-core-kit/expo` | `withMonitoring(config)` for `app.config.js` (plain Node) |
| `app-core-kit/metro` | `monitoringMetroConfig(__dirname)` for `metro.config.js` (plain Node) |
| `app-kit-pins` (command) | The kit pin check, below |
| `app-sheet-check` (command) | 1.9.0: the App Sheet check, below |
| `app-core-kit/package.json` | The kit's `version`, for an About > Kits list |

## Quick start

```ts
// index.ts (app start)
import { startMonitoring } from 'app-core-kit';

startMonitoring({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });
```

```js
// app.config.js
const { withMonitoring } = require('app-core-kit/expo');
module.exports = ({ config }) => withMonitoring(config);

// metro.config.js
const { monitoringMetroConfig } = require('app-core-kit/metro');
module.exports = monitoringMetroConfig(__dirname);
```

```tsx
// Around each screen
import { ErrorBoundary, reportError, withTimeout } from 'app-core-kit';

<ErrorBoundary where="home" resetKeys={[route]} colors={{ bg: '#0B0B0C', accent: '#5CFFB1' }}>
  <HomeScreen />
</ErrorBoundary>

// The app's whole page: "Try Again" goes back to Home, "Log Out" only while someone is signed in
<ErrorBoundary
  where={route.name}
  onReset={() => setRoute(HOME)}
  strings={{ retry: 'Back to Home' }}
  onSignOut={signedIn ? signOut : undefined}
  colors={{ bg: COLORS.bg, text: COLORS.text, muted: COLORS.muted, accent: COLORS.accent }}
>
  {body}
</ErrorBoundary>

// A handled failure
try {
  await withTimeout(save(), 15_000);
} catch (e) {
  reportError('save', e);
}
```

For readable crash stacks, set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as EAS environment variables, and `EXPO_PUBLIC_SENTRY_DSN` for the app. With none set, the build is unchanged; with only some set, a warning names the missing ones.

## Kit pin check

One check for every app, so the apps never keep their own copies. Every kit (a package named `app-<name>-kit`) must use the standard pin, the full commit SHA of a release tag, and `kitVersions` must name that tag:

```jsonc
"scripts": { "check:kits": "app-kit-pins" },
"dependencies": { "app-settings-kit": "git+https://github.com/yuvarajsalla20/app-settings-kit.git#<full SHA of v8.0.0>" },
"kitVersions": { "app-settings-kit": "v8.0.0" }
```

Run `npm run check:kits` after `npm ci` (locally and in CI). It fails, and says the fix, when a tag is missing, a pin points at another commit, a kit has no `kitVersions` entry, or a kit uses another pin format (a codeload tarball, a short SHA, a branch or an npm range). `npm install` may write `git+ssh://` into package-lock.json; change those back to `git+https://` so CI and EAS can install without SSH keys.

## App Sheet check (1.9.0)

Every app keeps one `APP.md`, the App Sheet: what the app runs on (each service, its plan and the account that pays), the kits, the owner switches in Firestore `config/app`, the names of its keys and secrets, and the one-time setup steps. The template is in app-starter-template. This check keeps the sheet true to the code, so a version change can never leave it behind:

```jsonc
"scripts": { "check:app": "app-sheet-check" }
```

Run `npm run check:app` locally and in CI. It fails, and says the fix, when `APP.md` is missing or has no `**Last reviewed:** YYYY-MM-DD` line, when its Version row is not the version in `app.json`, when its Kits table does not list exactly the kits and versions in `kitVersions`, or when a key in `.env.example` is not named in it (a written prefix such as `EXPO_PUBLIC_FIREBASE_*` covers its keys). Services, plans and owner switches cannot be read from the code, so each app's `CLAUDE.md` asks for those to be updated in the same pull request.

## Readable crash stacks: metro.config.js

Every app that uses Sentry needs a `metro.config.js` at its root with exactly this, and nothing else is needed:

```js
// metro.config.js
const { monitoringMetroConfig } = require('app-core-kit/metro');
module.exports = monitoringMetroConfig(__dirname);
```

**Why:** `withMonitoring` (in `app.config.js`) uploads the source maps to Sentry, but Sentry can only match a crash to its source map through a debug id that Metro writes into the bundle. Expo's default Metro config does not write it. Without this file the app builds and runs normally and crashes still arrive, but their stack traces stay unreadable, and nothing warns you.

**What it does:** when `SENTRY_AUTH_TOKEN` is set (an EAS build with the Sentry variables), it returns Sentry's Expo config (`getSentryExpoConfig`), which adds the debug ids. Otherwise (local development, or no Sentry) it returns Expo's default config unchanged, so the file is safe to have everywhere.

**Your own Metro changes:** change the returned config, then export it.

```js
const { monitoringMetroConfig } = require('app-core-kit/metro');
const config = monitoringMetroConfig(__dirname);
config.resolver.assetExts.push('lottie');
module.exports = config;
```

**A guard:** when all three Sentry variables are set, `withMonitoring` warns during the build if the app has no `metro.config.js` that uses `app-core-kit/metro`.

**Check it:** after an EAS build with the Sentry variables set, a test crash in Sentry shows your own file names and line numbers, not `index.android.bundle:1:23456`.

## What you get

| Piece | What it does |
|---|---|
| `<ErrorBoundary where colors? strings? resetKeys? onReset? onSignOut? fallback?>` | A screen that crashes shows a calm "Try Again" screen instead of closing the app, and the crash is reported. With `onSignOut` it also shows "Log Out", so a screen that keeps crashing cannot trap anyone; once sign-out finishes, the content is tried again. `strings` replaces the words (title, retry, signOut, message); `resetKeys` clears the screen when a key changes; `onReset` runs on "Try Again" |
| `startMonitoring({ dsn })` | One call at launch (a second call does nothing): installs the global handler and, if `dsn` is set, starts Sentry with privacy-safe settings (no screenshots, breadcrumbs, user details, session replay or feedback form; every text field and key scrubbed). Resolves `true` when Sentry is running |
| `installGlobalHandler()` | Reports uncaught errors and unhandled promise rejections, then lets the app's normal behavior continue. `startMonitoring` calls it for you |
| `reportError(where, error)` | The one place handled failures are recorded. Scrubs personal data and secrets (see below), never throws, drops repeats within 5 s, sends at most 30 a minute, keeps the error `code` and a scrubbed `cause`, and holds up to 20 reports made before the crash service is connected |
| `setReporter(fn, { capturesGlobalErrors })` | Connects another crash service (Crashlytics). Pass `capturesGlobalErrors: true` when the service already catches uncaught errors, so they are not sent twice |
| `scrub(text)`, `scrubEvent(event)` | The scrubbing, for your own use or another crash service |
| `withTimeout(promise, ms)`, `TimeoutError`, `isTimeoutError` | Time limits. A `TimeoutError` has `code: 'timeout'` |
| `retry(fn, options)`, `sleep(ms)` | Retries with growing, capped, jittered waits. `shouldRetry` skips errors that can never succeed |
| `friendlyMessage(error)`, `isNetworkError`, `isPermissionError` | Plain words for common failures. Only whole phrases such as "Network request failed" count as a lost connection |
| `FALLBACK_MESSAGE`, `NO_CONNECTION_MESSAGE`, `TIMEOUT_MESSAGE` | The default texts |
| `KIT_NAME`, `KIT_VERSION` | The kit's name and version (a test keeps it equal to package.json) |

## Privacy

**What is scrubbed:** emails, phone and card-like numbers, IP addresses, home-folder paths, tokens, Bearer and `password=` / `client_secret=` / `session_id=` / `id_token=` style secrets, plain `password: …` / `token: …` / `api_key: …` / `private_key: …` values, PEM private key blocks, quoted JSON values (also escaped), `Authorization:` and `Cookie:` header lines, everything after a `?` in a link, and dates (they may be a birth date). Sentry events also lose the user, request, breadcrumbs, server name and the phone's name. `release`, `dist`, `environment` and Sentry's own trace ids are kept so Sentry can group and link.

**What it cannot do:** it works on patterns, so names, street addresses, ZIP codes, coordinates and plain words used as secrets are not recognised. Crashes inside native iPhone or Android code are reported by the Sentry SDK itself and do not pass through this scrubbing. Do not put personal data in error text.

**What a report contains:** the scrubbed error text, the screen name, and what Sentry adds itself: device model, OS, app version, and the IP address. Turn on "Prevent Storing of IP Addresses" in the Sentry project, and declare "Diagnostics" in the App Store privacy answers.

## Development

```bash
npm install
npm run typecheck
npm test
```

To release: bump `version` in `package.json` and `KIT_VERSION` in `src/kit.ts`, add a note to [CHANGELOG.md](CHANGELOG.md), merge, then tag the merged commit.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Writing rule

Every word this kit shows, and every line of its documentation, follows the shared [Writing rule](https://github.com/yuvarajsalla20/app-settings-kit#writing-rule-every-word-is-professional): Title Case for titles, rows and buttons; calm, complete sentences for captions and messages; "e.g.," for examples; no chatty fragments, slang or exclamation marks. Apps do not override these words; a change is made in the kit so that every app receives it.

## License

MIT
