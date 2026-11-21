const fs = require('fs');
const path = require('path');

// The source maps uploaded here only help when Metro writes Sentry's debug ids into the bundle (app-core-kit/metro).
const METRO_FILES = ['metro.config.js', 'metro.config.cjs', 'metro.config.mjs', 'metro.config.ts'];
const usesMonitoringMetro = (projectRoot) =>
  METRO_FILES.some((name) => {
    try {
      return /monitoringMetroConfig|getSentryExpoConfig/.test(fs.readFileSync(path.join(projectRoot, name), 'utf8'));
    } catch {
      return false;
    }
  });

/**
 * For app.config.js: adds Sentry's Expo plugin (readable crash stacks, source maps uploaded at build time) only when
 * SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are all set, for example as EAS secrets. Without them the build is unchanged.
 * When they are set but the app has no metro.config.js using app-core-kit/metro, it warns: the stacks would stay unreadable.
 * `projectRoot` defaults to the folder the build runs in (the app's root, for Expo and EAS).
 */
const withMonitoring = (config, projectRoot = process.cwd()) => {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  const missing = [['SENTRY_AUTH_TOKEN', SENTRY_AUTH_TOKEN], ['SENTRY_ORG', SENTRY_ORG], ['SENTRY_PROJECT', SENTRY_PROJECT]].filter(([, v]) => !v).map(([k]) => k);
  // None set means "not using Sentry builds". Some set means a typo or a missing secret: say so, or the build ships unreadable crash stacks without a sign.
  if (missing.length && missing.length < 3) console.warn(`[app-core-kit] withMonitoring: ${missing.join(', ')} not set, so crash stacks will not be readable. Set all three, or none.`);
  if (missing.length) return config;
  if (!usesMonitoringMetro(projectRoot)) {
    console.warn("[app-core-kit] withMonitoring: no metro.config.js using app-core-kit/metro, so crash stacks will not be readable. Add one with: module.exports = require('app-core-kit/metro').monitoringMetroConfig(__dirname);");
  }
  return { ...config, plugins: [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization: SENTRY_ORG, project: SENTRY_PROJECT }]] };
};

module.exports = { withMonitoring };
