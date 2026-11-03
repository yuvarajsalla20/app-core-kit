# app-core-kit

Reusable non-functional basics for React Native / Expo apps (iOS, Android, web). No native dependencies, nothing specific to any one app.
Companion to [app-auth-kit](https://github.com/yuvarajsalla20/app-auth-kit).

| Piece | What it does |
|---|---|
| `<ErrorBoundary where="home">` | A screen that crashes shows a calm "Try again" screen instead of killing the app, and the crash is reported |
| `installGlobalHandler()` | Reports uncaught errors and unhandled promise rejections, then lets the app's normal behavior continue |
| `reportError(where, error)` | The one place handled failures are recorded. Scrubs emails, phone and card-like numbers, long numbers and tokens, never throws, drops repeats within 5 s, holds up to 20 reports made before the crash service is connected |
| `setReporter(fn, { capturesGlobalErrors })` | Connects a crash service (Sentry, Crashlytics...). The kit itself has no dependency on any. Pass `capturesGlobalErrors: true` when the service already catches uncaught errors (Sentry does) so they are not sent twice |
| `withTimeout`, `retry`, `sleep` | Time limits and retries with growing waits (`shouldRetry` skips errors that can never succeed) |
| `friendlyMessage`, `isNetworkError`, `isPermissionError` | Plain-language text for common failures |

```ts
// App start
import { installGlobalHandler, setReporter } from 'app-core-kit';
import * as Sentry from '@sentry/react-native';

Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });
setReporter((where, error, extra) => Sentry.captureException(error, { tags: { where }, extra }), { capturesGlobalErrors: true });
installGlobalHandler();
```

```tsx
<ErrorBoundary where="home" colors={{ bg: '#0B0B0C', accent: '#5CFFB1' }}><HomeScreen /></ErrorBoundary>
```

Privacy: the kit scrubs what it reports, but a crash service has its own capture paths (fatal and native crashes). Also scrub inside the service with `scrub` in its `beforeSend`, and turn off breadcrumbs and screenshots.

Develop: `npm install`, `npm run typecheck`, `npm test`.
