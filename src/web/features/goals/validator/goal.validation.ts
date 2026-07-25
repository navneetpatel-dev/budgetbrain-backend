import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
} from '../../../../validation';

export const createGoalSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['emergency_fund', 'vacation', 'car', 'home', 'investments', 'other']),
  targetAmount: amountField(),
  currency: currencyField(true),
  targetDate: optionalDate,
});

export const updateGoalSchema = z.object({
  name: optionalText('entityName'),
  targetAmount: amountField().optional(),
  targetDate: optionalDate,
});

export const contributeGoalSchema = z.object({
  amount: amountField(),
  notes: optionalText('notes'),
});
