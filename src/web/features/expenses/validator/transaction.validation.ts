import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  amountField,
  ValidationMessages as M,
} from '../../../../validation';

const transactionObjectSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: z.string().uuid(M.uuidInvalid).optional(),
  incomeSourceId: z.string().uuid(M.uuidInvalid).optional(),
  notes: optionalText('notes'),
  merchant: optionalText('merchant'),
  date: requiredDate,
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const transactionSchema = transactionObjectSchema.superRefine((data, ctx) => {
  if (data.type === 'expense' && !data.merchant) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['merchant'],
      message: M.minChars(1),
    });
  }
});

export const listTransactionsSchema = paginationSchema.merge(dateRangeSchema).extend({
  type: z.enum(['expense', 'income']).optional(),
  categoryId: z.string().uuid(M.uuidInvalid).optional(),
  search: optionalText('search'),
});

export const searchQuerySchema = paginationSchema.extend({
  q: requiredText('search'),
});

export const updateTransactionSchema = transactionObjectSchema.partial();

export const syncTransactionCreateSchema = transactionSchema;

export const syncTransactionUpdateSchema = updateTransactionSchema.extend({
  id: z.string().uuid(M.uuidInvalid).optional(),
});

export const syncTransactionDeleteSchema = z.object({
  id: z.string().uuid(M.uuidInvalid).optional(),
});

export const attachmentParamsSchema = z.object({
  id: z.string().uuid(M.uuidInvalid),
  attachmentId: z.string().uuid(M.uuidInvalid),
});
