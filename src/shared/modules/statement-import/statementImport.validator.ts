import { z } from 'zod';
import { uuidField } from '@shared/validation/index';
import { STATEMENT_FORMATS } from './statementImport.types';

const column = z.string().trim().min(1).max(100);

/** How to read a CSV: which header row and which columns (plan T6.5). */
export const csvMappingSchema = z
  .object({
    headerRow: z.number().int().min(1).max(50).default(1),
    dateColumn: column,
    descriptionColumn: column,
    amountColumn: column.optional(),
    debitColumn: column.optional(),
    creditColumn: column.optional(),
    referenceColumn: column.optional(),
    currencyColumn: column.optional(),
    dateOrder: z.enum(['DMY', 'MDY', 'YMD']).default('DMY'),
    /** Which sign a single amount column uses for money out. */
    amountSign: z.enum(['debit_negative', 'credit_negative']).default('debit_negative'),
  })
  .strict()
  .refine((m) => !!m.amountColumn || !!m.debitColumn || !!m.creditColumn, {
    message: 'Pick an amount column, or debit and credit columns',
  });

/** The `options` field sent with a statement file (JSON in a multipart form). */
export const importOptionsSchema = z
  .object({
    format: z.enum(STATEMENT_FORMATS).optional(),
    mapping: csvMappingSchema.optional(),
    /** The account the statement belongs to; its last digits identify the rows. */
    financialAccountId: uuidField().nullable().optional(),
    /** For files that don't say (CSV, QIF); defaults to the user's currency. */
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    /** QIF and CSV day/month order when the file doesn't settle it. */
    dateOrder: z.enum(['DMY', 'MDY', 'YMD']).optional(),
    /** Import rows that look like existing transactions too (they wait for review). */
    includePossibleDuplicates: z.boolean().default(true),
  })
  .strict();
