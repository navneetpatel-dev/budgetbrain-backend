import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  optionalGoalTargetDate,
  amountField,
  enumField,
} from '../../../../shared/validation';

export const createGoalSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['emergency_fund', 'vacation', 'car', 'home', 'investments', 'other'] as const),
  targetAmount: amountField(),
  currency: currencyField(true),
  targetDate: optionalGoalTargetDate,
});

export const updateGoalSchema = z.object({
  name: optionalText('entityName'),
  targetAmount: amountField().optional(),
  targetDate: optionalGoalTargetDate,
});

export const contributeGoalSchema = z.object({
  amount: amountField(),
  notes: optionalText('notes'),
});
