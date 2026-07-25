import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
} from '../../../../validation';

export const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: z.string().uuid().optional(),
  incomeSourceId: z.string().uuid().optional(),
  notes: optionalText('notes'),
  merchant: optionalText('merchant'),
  date: requiredDate,
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

export const syncTransactionCreateSchema = transactionSchema;

export const syncTransactionUpdateSchema = updateTransactionSchema.extend({
  id: z.string().uuid().optional(),
});

export const syncTransactionDeleteSchema = z.object({
  id: z.string().uuid().optional(),
});

export const attachmentParamsSchema = z.object({
  id: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
