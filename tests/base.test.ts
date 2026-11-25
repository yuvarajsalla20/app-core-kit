import { describe, expect, it } from 'vitest';
import * as base from '../src/base';

describe('app-core-kit/shared (1.11.0)', () => {
  it('holds the shared helpers and nothing else', () => {
    expect(Object.keys(base).sort()).toEqual(['CSV_BOM', 'DEFAULT_PLAN_MODE', 'escapeHtml', 'getPlanMode', 'isNetworkError', 'isPermissionError', 'offeredOptions', 'planModeFrom', 'setPlanMode', 'toCsv', 'usePlanMode', 'usePremiumOffered', 'useShallowStable', 'withAlpha']);
  });
});

describe('plan mode (1.12.0)', () => {
  it('sells only for "subscription", and only to testers while a list is set', () => {
    expect(base.planModeFrom(undefined, 'a')).toBe('free');
    expect(base.planModeFrom({ planMode: 'subscription' }, null)).toBe('subscription');
    expect(base.planModeFrom({ planMode: 'subscription', subscriptionTesters: ['a'] }, 'b')).toBe('free');
    expect(base.planModeFrom({ planMode: 'subscription', subscriptionTesters: ['a'] }, 'a')).toBe('subscription');
  });
  it('keeps one value under the shared global key', () => {
    base.setPlanMode('subscription');
    expect(base.getPlanMode()).toBe('subscription');
    expect((globalThis as unknown as Record<symbol, { mode: string }>)[Symbol.for('app-kits/plan-mode')]!.mode).toBe('subscription');
    base.setPlanMode('free');
    expect(base.getPlanMode()).toBe('free');
  });
  it('offers a locked option only while Premium is offered, or when it is already chosen', () => {
    const items = [{ id: 'a', locked: false }, { id: 'b', locked: true }, { id: 'c', locked: true }];
    expect(base.offeredOptions(items, false, (i) => i.locked, (i) => i.id === 'c').map((i) => i.id)).toEqual(['a', 'c']);
    expect(base.offeredOptions(items, true, (i) => i.locked, () => false)).toHaveLength(3);
  });
});
