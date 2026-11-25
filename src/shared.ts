import { useState } from 'react';

/**
 * Small helpers every kit needs, kept here once so the kits stop carrying their own copies (which had begun to differ).
 */

// A plain number such as -12.50 or +3 is safe: it cannot run as a formula.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

const csvCell = (value: string): string => {
  // A leading = + - @ tab or return would run as a formula in Excel and Sheets, so it is marked as plain text (plain numbers stay numbers).
  const text = /^[=+\-@\t\r]/.test(value) && !PLAIN_NUMBER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Put this first in a file for Excel to read accents and non-English letters correctly. */
export const CSV_BOM = '﻿';

/** Rows of text as CSV that opens safely in Excel, Numbers and Google Sheets. The first row is usually the header. `bom` adds the Excel marker. */
export const toCsv = (rows: readonly (readonly string[])[], options: { bom?: boolean } = {}): string =>
  (options.bom && rows.length ? CSV_BOM : '') + rows.map((row) => row.map(csvCell).join(',')).join('\n');

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text made safe to put inside HTML, quotes included. */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]!);

/** `#rrggbb` (or `#rgb`) at `alpha` (0 to 1), as `#rrggbbaa`. Any other color gives null, so the caller can fall back. */
export const withAlpha = (color: string, alpha: number): string | null => {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${a.toString(16).padStart(2, '0')}`;
};

const shallowEqual = (a: object, b: object): boolean => {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** Keeps the same object while its own values are the same (inline theme or strings objects passed on every render). */
export function useShallowStable<T extends object | undefined>(value: T): T {
  const [kept, setKept] = useState(value);
  const same = kept === value || (!!kept && !!value && shallowEqual(kept, value));
  if (!same) setKept(value);
  return same ? kept : value;
}
