import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../shared/validation';

export const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional(),
  incomeSourceId: z.string().uuid().optional(),
  notes: z.string().optional(),
  merchant: z.string().optional(),
  date: z.string(),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: z.string().optional(),
});

export const listTransactionsSchema = paginationSchema
  .merge(dateRangeSchema)
  .extend({
    type: z.enum(['expense', 'income']).optional(),
    categoryId: z.string().uuid().optional(),
    search: z.string().optional(),
  });

export const searchQuerySchema = z.object({ q: z.string().min(1) });

export type CreateTransactionInput = z.infer<typeof transactionSchema>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;
