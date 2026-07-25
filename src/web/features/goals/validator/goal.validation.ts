import { z } from 'zod';
import { optionalText, requiredText, currencyField } from '../../../../validation';

export const createGoalSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['emergency_fund', 'vacation', 'car', 'home', 'investments', 'other']),
  targetAmount: z.number().positive(),
  currency: currencyField(true),
  targetDate: z.string().min(1).max(40).optional(),
});

export const updateGoalSchema = z.object({
  name: optionalText('entityName'),
  targetAmount: z.number().positive().optional(),
  targetDate: z.string().min(1).max(40).optional(),
});

export const contributeGoalSchema = z.object({
  amount: z.number().positive(),
  notes: optionalText('notes'),
});
