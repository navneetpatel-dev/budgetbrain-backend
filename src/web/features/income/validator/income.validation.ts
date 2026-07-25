import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import { optionalText, requiredText, currencyField } from '../../../../validation';

export const listIncomeSchema = dateRangeSchema.merge(paginationSchema);

export const createIncomeSchema = z.object({
  amount: z.number().positive(),
  currency: currencyField(true),
  incomeSourceId: z.string().uuid().optional(),
  notes: optionalText('notes'),
  date: z.string().min(1).max(40),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const updateIncomeSchema = z.object({
  amount: z.number().positive().optional(),
  notes: optionalText('notes'),
  date: z.string().min(1).max(40).optional(),
  incomeSourceId: z.string().uuid().optional(),
});

export const createSourceSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['salary', 'freelancing', 'investments', 'rental', 'other']),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});
