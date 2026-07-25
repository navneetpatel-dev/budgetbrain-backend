import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
} from '../../../../validation';

export const createBudgetSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['monthly', 'weekly', 'category']),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: z.string().uuid().optional(),
  startDate: requiredDate,
  endDate: optionalDate,
  alertThreshold: z.number().min(1).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  name: optionalText('entityName'),
  amount: amountField().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
  endDate: optionalDate,
});
