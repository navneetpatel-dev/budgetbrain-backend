import type { z } from 'zod';
import type { importOptionsSchema } from './statementImport.validator';

export const STATEMENT_FORMATS = ['csv', 'ofx', 'qif', 'mt940', 'camt053'] as const;
export type StatementFormat = (typeof STATEMENT_FORMATS)[number];

/**
 * One statement line after parsing (plan T6.5). The description is the bank's text for the
 * line; only its cleaned merchant name is stored.
 */
export interface StatementRow {
  /** 1-based line or entry number in the file, for error messages. */
  line: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Positive decimal string, e.g. `"1250.00"`. */
  amount: string;
  direction: 'DEBIT' | 'CREDIT';
  /** ISO 4217 when the file says, otherwise the import's currency. */
  currency: string | null;
  description: string;
  /** The bank's own id for the line (OFX FITID, MT940 reference, CAMT AcctSvcrRef). */
  reference: string | null;
}

/** A line the parser could not read, reported instead of stopping the import. */
export interface StatementRowError {
  line: number;
  error: string;
}

export type ParsedLine = { ok: true; row: StatementRow } | { ok: false; error: StatementRowError };

export type ImportOptions = z.infer<typeof importOptionsSchema>;
export type CsvMapping = NonNullable<ImportOptions['mapping']>;

export interface CsvLayout {
  delimiter: string;
  columns: string[];
  suggestedMapping: CsvMapping | null;
}

export interface ImportPreviewRow {
  line: number;
  date: string;
  amount: string;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  transactionType: 'expense' | 'income' | 'refund';
  merchant: string | null;
  possibleDuplicate: boolean;
}

export interface ImportPreview {
  format: StatementFormat;
  /** CSV only: the header and the mapping the server guessed. */
  csv: CsvLayout | null;
  /** True when a CSV needs the user to pick columns before it can be read. */
  needsMapping: boolean;
  totalRows: number;
  validRows: number;
  possibleDuplicates: number;
  /** Rows an earlier import already added. */
  alreadyImported: number;
  errors: StatementRowError[];
  /** The first rows, as they would be imported. */
  rows: ImportPreviewRow[];
  dateRange: { from: string; to: string } | null;
}

export interface ImportResult {
  format: StatementFormat;
  totalRows: number;
  created: number;
  needsReview: number;
  alreadyImported: number;
  /** Rows left out because they looked like existing transactions (when asked to). */
  skippedDuplicates: number;
  invalid: number;
  errors: StatementRowError[];
}
