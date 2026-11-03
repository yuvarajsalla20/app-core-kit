const NETWORK_CODES = new Set(['unavailable', 'deadline-exceeded', 'auth/network-request-failed', 'network-request-failed']);

const codeOf = (error: unknown): string => (error as { code?: string })?.code ?? '';

/** True for "no connection" style failures, where trying again later is the right advice. */
export const isNetworkError = (error: unknown): boolean =>
  NETWORK_CODES.has(codeOf(error)) || /network|timed out|offline/i.test((error as Error)?.message ?? '');

/** Permission problems will not fix themselves by retrying. */
export const isPermissionError = (error: unknown): boolean => codeOf(error) === 'permission-denied';

/** A sentence a person can act on, for any error. */
export const friendlyMessage = (error: unknown): string => {
  if (isNetworkError(error)) return 'No connection. Check your internet and try again.';
  if (isPermissionError(error)) return 'You do not have access to that. Sign in again, or contact support.';
  return 'Something went wrong. Please try again.';
};
