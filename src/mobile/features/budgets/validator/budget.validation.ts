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
  enumField,
  ValidationMessages as M,
} from '../../../../validation';

export const createBudgetSchema = z
  .object({
    name: requiredText('entityName'),
    type: enumField(['monthly', 'weekly', 'category'] as const),
    amount: amountField(),
    currency: currencyField(true),
    categoryId: uuidField().optional(),
    startDate: requiredDate,
    endDate: optionalDate,
    alertThreshold: alertThresholdField(true),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'category' && !data.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryId'],
        message: M.categoryRequired,
      });
    }
  });

export const updateBudgetSchema = z.object({
  name: optionalText('entityName'),
  amount: amountField().optional(),
  alertThreshold: alertThresholdField(true),
  endDate: optionalDate,
});
