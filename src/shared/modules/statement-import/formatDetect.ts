import type { StatementFormat } from './statementImport.types';

/**
 * Which parser reads a file (plan T6.5), from its first few kilobytes and, when the content
 * doesn't settle it, its extension. Anything unrecognised is treated as CSV.
 */
export function detectFormat(head: string, fileName: string): StatementFormat {
  const text = head.replace(/^\uFEFF/, '').trimStart();
  if (/^OFXHEADER\s*:/i.test(text) || /<OFX[\s>]/i.test(text)) return 'ofx';
  if (/camt\.053|<(?:\w+:)?BkToCstmrStmt[\s>]/i.test(text)) return 'camt053';
  if (/^!(Type|Account|Option)/im.test(text)) return 'qif';
  if (/^:20:/m.test(text) && /^:(25|28C|60F|61):/m.test(text)) return 'mt940';
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  if (ext === 'qif') return 'qif';
  if (ext === 'sta' || ext === 'mt940' || ext === '940') return 'mt940';
  return 'csv';
}
