/**
 * For app.config.js: adds Sentry's Expo plugin (readable crash stacks, source maps uploaded at build time) only when
 * SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are all set, for example as EAS secrets. Without them the build is unchanged.
 */
const withMonitoring = (config) => {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  const missing = [['SENTRY_AUTH_TOKEN', SENTRY_AUTH_TOKEN], ['SENTRY_ORG', SENTRY_ORG], ['SENTRY_PROJECT', SENTRY_PROJECT]].filter(([, v]) => !v).map(([k]) => k);
  // None set means "not using Sentry builds". Some set means a typo or a missing secret: say so, or the build ships unreadable crash stacks without a sign.
  if (missing.length && missing.length < 3) console.warn(`[app-core-kit] withMonitoring: ${missing.join(', ')} not set, so crash stacks will not be readable. Set all three, or none.`);
  if (missing.length) return config;
  return { ...config, plugins: [...(config.plugins ?? []), ['@sentry/react-native/expo', { organization: SENTRY_ORG, project: SENTRY_PROJECT }]] };
};

module.exports = { withMonitoring };
