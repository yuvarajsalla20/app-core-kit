# Changelog

Upgrade notes for app-core-kit, newest first. Each version is tagged in git (`v1.6.1`).

## 1.6.1

Nothing breaks. In development an unhandled promise rejection shows React Native's yellow warning again (the kit's tracker had replaced it); release builds behave as before.

## 1.6.0

Nothing breaks. New `strings` and `resetKeys` on `ErrorBoundary`; more secret shapes are hidden; a release such as `com.app@1.2.0+45` is no longer mistaken for an email address; the reporter keeps working if the phone's clock is set back; `sideEffects: false`. Dates in messages are still hidden (they may be a birth date).

## 1.5.0

`startMonitoring` now resolves a boolean instead of nothing. A timeout now says `TIMEOUT_MESSAGE` ("That took too long") instead of "No connection", and `isNetworkError` no longer matches the bare words "network" or "offline". New: `TimeoutError`, `isTimeoutError`, `TIMEOUT_MESSAGE`.
