/**
 * For metro.config.js, in every app that uses Sentry:
 *
 *   const { monitoringMetroConfig } = require('app-core-kit/metro');
 *   module.exports = monitoringMetroConfig(__dirname);
 *
 * Returns Expo's default config, with Sentry's debug ids added when SENTRY_AUTH_TOKEN is set (EAS builds). Without
 * the debug ids Sentry cannot match a crash to the source maps that withMonitoring uploads, so stacks stay unreadable.
 * To change Metro further, change the returned config before exporting it. See README "Readable crash stacks".
 */
const monitoringMetroConfig = (projectRoot) => {
  if (!process.env.SENTRY_AUTH_TOKEN) return require('expo/metro-config').getDefaultConfig(projectRoot);
  return require('@sentry/react-native/metro').getSentryExpoConfig(projectRoot);
};

module.exports = { monitoringMetroConfig };
