import { z } from 'zod';
import {
  dateRangeObjectSchema,
  paginationSchema,
  refineDateRangeOrder,
} from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  transactionDate,
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
  date: transactionDate,
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

export const listTransactionsSchema = paginationSchema
  .merge(dateRangeObjectSchema)
  .extend({
    type: enumField(['expense', 'income'] as const).optional(),
    categoryId: uuidField().optional(),
    incomeSourceId: uuidField().optional(),
    paymentMethod: enumField(['cash', 'card', 'upi', 'bank_transfer', 'other'] as const).optional(),
    search: optionalText('search'),
  })
  .superRefine(refineDateRangeOrder);

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
