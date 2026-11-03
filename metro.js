/** For metro.config.js: Expo's default config, with Sentry's debug-id support added when SENTRY_AUTH_TOKEN is set. */
const monitoringMetroConfig = (projectRoot) => {
  if (!process.env.SENTRY_AUTH_TOKEN) return require('expo/metro-config').getDefaultConfig(projectRoot);
  return require('@sentry/react-native/metro').getSentryExpoConfig(projectRoot);
};

module.exports = { monitoringMetroConfig };
