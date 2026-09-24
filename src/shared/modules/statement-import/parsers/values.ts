/**
 * Amounts and dates as banks write them in statement files (plan T6.5).
 */

export type DateOrder = 'YMD' | 'DMY' | 'MDY';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fullYear(y: number): number {
  return y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
}

function isoDate(y: number, m: number, d: number): string | null {
  const year = fullYear(y);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${year}-${pad(m)}-${pad(d)}`;
  const check = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * `2026-09-24`, `24/09/2026`, `09/24/26`, `24-Sep-2026`, `24 Sep 2026`, `20260924`.
 * Numeric day/month order comes from `order`; a first part above 12 settles it either way.
 */
export function parseStatementDate(input: string, order: DateOrder = 'DMY'): string | null {
  const text = input.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\.\d+)?(?:\[.*\])?$/.exec(text);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-\s/.]([A-Za-z]{3,4})[-\s/.,]*(\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[1])) : null;
  }
  m = /^([A-Za-z]{3,4})[-\s/.]+(\d{1,2})[,\s]+(\d{2,4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase()];
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.'](\d{2,4})$/.exec(text);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12) return isoDate(y, b, a);
    if (b > 12) return isoDate(y, a, b);
    return order === 'MDY' ? isoDate(y, a, b) : isoDate(y, b, a);
  }
  return null;
}

/**
 * A signed amount: `-1,234.56`, `(12.00)`, `1.234,56`, `12.00 DR`, `₹ 500`, `1 234,56`.
 * Returns the absolute decimal with a dot, and the sign it carried (or null when unsigned).
 */
export function parseStatementAmount(input: string): { amount: string; negative: boolean | null } | null {
  let text = input.trim();
  if (!text) return null;
  let negative: boolean | null = null;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const marker = /\s*\b(DR|CR|D|C)\.?$/i.exec(text);
  if (marker) {
    negative = /^d/i.test(marker[1]!);
    text = text.slice(0, marker.index);
  }
  text = text.replace(/[^\d.,'\s+-]/g, '').trim();
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    negative = false;
    text = text.slice(1);
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }
  text = text.replace(/[\s']/g, '');
  if (!/^[\d.,]+$/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let integer = text;
  let fraction = '';
  const decimalAt = Math.max(lastDot, lastComma);
  if (decimalAt >= 0) {
    const tail = text.slice(decimalAt + 1);
    const separator = text[decimalAt];
    const other = separator === '.' ? ',' : '.';
    // "1,234", "1,23,456" or "1.234.567": one kind of separator with three digits after the
    // last one is digit grouping, not a decimal point.
    if (tail.length === 3 && !text.includes(other)) {
      integer = text;
    } else {
      integer = text.slice(0, decimalAt);
      fraction = tail;
    }
  }
  integer = integer.replace(/[.,]/g, '');
  if (!/^\d+$/.test(integer) || !/^\d*$/.test(fraction) || fraction.length > 4) return null;
  const value = `${integer.replace(/^0+(?=\d)/, '')}${fraction ? `.${fraction}` : ''}`;
  return { amount: value, negative };
}

/** Collapses whitespace and trims; statement descriptions are often padded. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
