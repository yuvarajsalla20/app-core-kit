/**
 * `app-core-kit/shared`: the small helpers other kits import, without the rest of core-kit (no Sentry, no Remote Config).
 * Kits use this path so the one copy here is the only copy.
 */
export { CSV_BOM, escapeHtml, toCsv, useShallowStable, withAlpha } from './shared';
export { isNetworkError, isPermissionError } from './messages';
export { DEFAULT_PLAN_MODE, getPlanMode, offeredOptions, planModeFrom, setPlanMode, usePlanMode, usePremiumOffered } from './planMode';
export type { PlanMode, PlanModeSource } from './planMode';
