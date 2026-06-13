import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../shared/validation';

export const listIncomeSchema = dateRangeSchema.merge(paginationSchema);

export const createIncomeSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  incomeSourceId: z.string().uuid().optional(),
  notes: z.string().optional(),
  date: z.string(),
  isRecurring: z.boolean().optional(),
  recurringRule: z.string().optional(),
});

export const updateIncomeSchema = z.object({
  amount: z.number().positive().optional(),
  notes: z.string().optional(),
  date: z.string().optional(),
  incomeSourceId: z.string().uuid().optional(),
});

export const createSourceSchema = z.object({
  name: z.string(),
  type: z.enum(['salary', 'freelancing', 'investments', 'rental', 'other']),
  isRecurring: z.boolean().optional(),
  recurringRule: z.string().optional(),
});

export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;
export type UpdateIncomeInput = z.infer<typeof updateIncomeSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;
