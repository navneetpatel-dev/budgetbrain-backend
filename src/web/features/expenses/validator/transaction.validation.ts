import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  amountField,
  uuidField,
  enumField,
  ValidationMessages as M,
} from '../../../../shared/validation';

const transactionObjectSchema = z.object({
  type: enumField(['expense', 'income'] as const),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: uuidField().optional(),
  incomeSourceId: uuidField().optional(),
  notes: optionalText('notes'),
  merchant: optionalText('merchant'),
  date: requiredDate,
  paymentMethod: enumField(['cash', 'card', 'upi', 'bank_transfer', 'other'] as const).optional(),
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
  if (data.type === 'expense' && !data.categoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryId'],
      message: M.categoryRequired,
    });
  }
});

export const listTransactionsSchema = paginationSchema.merge(dateRangeSchema).extend({
  type: enumField(['expense', 'income'] as const).optional(),
  categoryId: uuidField().optional(),
  search: optionalText('search'),
});

export const searchQuerySchema = paginationSchema.extend({
  q: requiredText('search'),
});

export const updateTransactionSchema = transactionObjectSchema.partial();

export const syncTransactionCreateSchema = transactionSchema;

export const syncTransactionUpdateSchema = updateTransactionSchema.extend({
  id: uuidField().optional(),
});

export const syncTransactionDeleteSchema = z.object({
  id: uuidField().optional(),
});

export const attachmentParamsSchema = z.object({
  id: uuidField(),
  attachmentId: uuidField(),
});
