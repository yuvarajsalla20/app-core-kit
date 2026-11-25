import { useSyncExternalStore } from 'react';

/**
 * Whether a plan is on sale in this app (1.12.0, moved here from app-account-kit and app-subscriptions-kit, which re-export it).
 * `'free'` (the default) sells nothing, so every Premium feature is hidden and only the free features show. `'subscription'`
 * shows the Subscription page, Plans, Premium tags and locks.
 *
 * The owner chooses it per app with `planMode` in the Firestore document `config/app`; app-subscriptions-kit or
 * app-settings-kit reads it and sets it here. The store sits under one global key, so every kit reads the same value.
 */
export type PlanMode = 'free' | 'subscription';

/** What every published app runs until the owner sets `planMode: "subscription"`. */
export const DEFAULT_PLAN_MODE: PlanMode = 'free';

interface PlanModeStore {
  mode: PlanMode;
  listeners: Set<() => void>;
}

const KEY = Symbol.for('app-kits/plan-mode');

const store = (): PlanModeStore => {
  const g = globalThis as unknown as Record<symbol, PlanModeStore | undefined>;
  return (g[KEY] ??= { mode: DEFAULT_PLAN_MODE, listeners: new Set() });
};

/** The plan mode now. */
export const getPlanMode = (): PlanMode => store().mode;

/** Sets the plan mode for every kit. Anything other than `'subscription'` is `'free'`. */
export function setPlanMode(mode: PlanMode): void {
  const s = store();
  const next: PlanMode = mode === 'subscription' ? 'subscription' : 'free';
  if (s.mode === next) return;
  s.mode = next;
  s.listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  const s = store();
  s.listeners.add(l);
  return () => {
    s.listeners.delete(l);
  };
};

/** The plan mode, kept in step. */
export function usePlanMode(): PlanMode {
  return useSyncExternalStore(subscribe, getPlanMode, getPlanMode);
}

/**
 * Whether Premium is offered at all: true only while the plan mode is `'subscription'`. While it is `'free'`, every
 * Premium feature is hidden: no row, option, tag, padlock, crown or paywall, so the app reads as complete without it.
 */
export const usePremiumOffered = (): boolean => usePlanMode() === 'subscription';

/**
 * The options to offer. While Premium is not offered, a locked option is left out, except the one already chosen, so
 * existing data still reads correctly; it then shows without a padlock.
 */
export function offeredOptions<T>(items: readonly T[], offered: boolean, isLocked: (item: T) => boolean, isChosen: (item: T) => boolean): readonly T[] {
  return offered ? items : items.filter((it) => !isLocked(it) || isChosen(it));
}

/**
 * Works out the plan mode from the `config/app` document for the signed-in account. Only `planMode: "subscription"` turns
 * selling on. While `subscriptionTesters` lists account ids, only those accounts see it, so a test never reaches customers;
 * an empty or missing list means every account. Anything else, or no document, is `'free'`.
 */
export function planModeFrom(data: unknown, userId: string | null | undefined): PlanMode {
  const d = data && typeof data === 'object' ? (data as { planMode?: unknown; subscriptionTesters?: unknown }) : {};
  if (d.planMode !== 'subscription') return 'free';
  const testers = Array.isArray(d.subscriptionTesters) ? d.subscriptionTesters.filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  if (testers.length === 0) return 'subscription';
  return userId && testers.includes(userId) ? 'subscription' : 'free';
}

/** Where the plan mode comes from: a fixed mode, or a lookup per account (e.g., `firestorePlanMode`). */
export type PlanModeSource = PlanMode | ((userId: string | null) => Promise<PlanMode>);
