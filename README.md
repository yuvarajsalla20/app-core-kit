# app-core-kit

Reusable non-functional basics for React Native / Expo apps (iOS, Android, web). No native dependencies, nothing specific to any one app.
Companion to [app-auth-kit](https://github.com/yuvarajsalla20/app-auth-kit).

| Piece | What it does |
|---|---|
| `<ErrorBoundary where="home">` | A screen that crashes shows a calm "Try again" screen instead of killing the app, and the crash is reported |
| `installGlobalHandler()` | Reports uncaught errors and unhandled promise rejections, then lets the app's normal behavior continue |
| `reportError(where, error)` | The one place handled failures are recorded. Scrubs emails, phone and card-like numbers, long numbers and tokens, never throws, drops repeats within 5 s, holds up to 20 reports made before the crash service is connected |
| `setReporter(fn, { capturesGlobalErrors })` | Connects a crash service (Sentry, Crashlytics...). The kit itself has no dependency on any. Pass `capturesGlobalErrors: true` when the service already catches uncaught errors (Sentry does) so they are not sent twice |
| `startMonitoring({ dsn })` | One call at launch: installs the global handler and, if `dsn` is set, starts Sentry with privacy-safe settings (no screenshots, breadcrumbs or user details; every text field scrubbed). Needs `@sentry/react-native` installed in the app; it loads only when `dsn` is set |
| `scrubEvent(event)` | The scrubbing `startMonitoring` applies to every Sentry event; reuse it for another crash service |
| `app-core-kit/expo`, `app-core-kit/metro` | Build helpers: `withMonitoring(config)` for `app.config.js` and `monitoringMetroConfig(__dirname)` for `metro.config.js`. They add Sentry's readable-stack-trace support only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` are set (EAS secrets) |
| `withTimeout`, `retry`, `sleep` | Time limits and retries with growing waits (`shouldRetry` skips errors that can never succeed) |
| `friendlyMessage`, `isNetworkError`, `isPermissionError` | Plain-language text for common failures |

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
<ErrorBoundary where="home" colors={{ bg: '#0B0B0C', accent: '#5CFFB1' }}><HomeScreen /></ErrorBoundary>
```

Privacy: reports contain the scrubbed error text, the screen name, and what Sentry adds itself: device model, OS and app version, and the IP address (turn on "Prevent Storing of IP Addresses" in the Sentry project). Install both kits from a pinned tag or commit.

Version: `import { KIT_VERSION } from 'app-core-kit'` gives the installed version (a test keeps it equal to package.json). Pass it, with the other kits' versions, to the account kit's `kitsLine` so the app can show and report every kit version in one line.

Develop: `npm install`, `npm run typecheck`, `npm test`.
