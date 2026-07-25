import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
  alertThresholdField,
  uuidField,
} from '../../../../validation';

export const createBudgetSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['monthly', 'weekly', 'category'], {
    errorMap: () => ({ message: 'Invalid option' }),
  }),
  amount: amountField(),
  currency: currencyField(true),
  categoryId: uuidField().optional(),
  startDate: requiredDate,
  endDate: optionalDate,
  alertThreshold: alertThresholdField(true),
});

export const updateBudgetSchema = z.object({
  name: optionalText('entityName'),
  amount: amountField().optional(),
  alertThreshold: alertThresholdField(true),
  endDate: optionalDate,
});
