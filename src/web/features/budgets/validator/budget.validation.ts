import { z } from 'zod';
import { optionalText, requiredText, currencyField } from '../../../../validation';

export const createBudgetSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['monthly', 'weekly', 'category']),
  amount: z.number().positive(),
  currency: currencyField(true),
  categoryId: z.string().uuid().optional(),
  startDate: z.string().min(1).max(40),
  endDate: z.string().min(1).max(40).optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  name: optionalText('entityName'),
  amount: z.number().positive().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
  endDate: z.string().min(1).max(40).optional(),
});
