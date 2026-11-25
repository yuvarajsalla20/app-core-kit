import { describe, expect, it } from 'vitest';
import * as base from '../src/base';

describe('app-core-kit/shared (1.11.0)', () => {
  it('holds the shared helpers and nothing else', () => {
    expect(Object.keys(base).sort()).toEqual(['CSV_BOM', 'escapeHtml', 'isNetworkError', 'isPermissionError', 'toCsv', 'useShallowStable', 'withAlpha']);
  });
});
