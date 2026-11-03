import { capturesGlobalErrors, reportError } from './report';

type Hermes = { enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void }) => void };

let installed = false;

/**
 * Reports errors nothing else caught: uncaught exceptions, and promises rejected with no handler.
 * The previous handler still runs, so the app's normal crash behavior is unchanged. Safe to call twice.
 */
export const installGlobalHandler = (): void => {
  if (installed) return;
  installed = true;
  if (typeof ErrorUtils !== 'undefined') {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      if (!capturesGlobalErrors()) reportError(isFatal ? 'fatal' : 'uncaught', error);
      previous(error, isFatal);
    });
  }
  const hermes = (globalThis as { HermesInternal?: Hermes }).HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({ allRejections: true, onUnhandled: (_id, error) => { if (!capturesGlobalErrors()) reportError('unhandled-promise', error); } });
  // On the web there is a browser event instead.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', (event) => { if (!capturesGlobalErrors()) reportError('unhandled-promise', (event as PromiseRejectionEvent).reason); });
  }
};
