/**
 * For app.config.js: adds Sentry's Expo plugin (readable crash stacks, source maps uploaded at build time) only when
 * SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are all set, for example as EAS secrets. Without them the build is unchanged.
 */
const withMonitoring = (config) => {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT) return config;
  return { ...config, plugins: [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization: SENTRY_ORG, project: SENTRY_PROJECT }]] };
};

module.exports = { withMonitoring };
