import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import { optionalText, requiredText, currencyField } from '../../../../validation';

export const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: currencyField(true),
  categoryId: z.string().uuid().optional(),
  incomeSourceId: z.string().uuid().optional(),
  notes: optionalText('notes'),
  merchant: optionalText('merchant'),
  date: z.string().min(1).max(40),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const listTransactionsSchema = paginationSchema.merge(dateRangeSchema).extend({
  type: z.enum(['expense', 'income']).optional(),
  categoryId: z.string().uuid().optional(),
  search: optionalText('search'),
});

export const searchQuerySchema = paginationSchema.extend({
  q: requiredText('search'),
});

export const updateTransactionSchema = transactionSchema.partial();

export const attachmentParamsSchema = z.object({
  id: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
