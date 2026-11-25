import { describe, expect, it } from 'vitest';
import { CSV_BOM, escapeHtml, toCsv, withAlpha } from '../src/shared';

describe('toCsv', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'two\nlines']])).toBe('"a,b","say ""hi""","two\nlines"');
  });
  it('stops formulas, tab and return included, but keeps plain numbers', () => {
    expect(toCsv([['=SUM(A1)', '+1+1', '@x', '\tcmd', '\rcmd', '-12.50', '+3']])).toBe(`'=SUM(A1),'+1+1,'@x,'\tcmd,"'\rcmd",-12.50,+3`);
  });
  it('adds the Excel marker only when asked and only with rows', () => {
    expect(toCsv([['a']], { bom: true })).toBe(`${CSV_BOM}a`);
    expect(toCsv([], { bom: true })).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
  });
});

describe('withAlpha', () => {
  it('adds alpha to #rrggbb and #rgb, clamped to 0..1', () => {
    expect(withAlpha('#112233', 0.5)).toBe('#11223380');
    expect(withAlpha('#abc', 1)).toBe('#aabbccff');
    expect(withAlpha('#112233', 2)).toBe('#112233ff');
  });
  it('gives null for any other color', () => {
    expect(withAlpha('red', 0.5)).toBeNull();
    expect(withAlpha('rgba(0,0,0,1)', 0.5)).toBeNull();
  });
});
