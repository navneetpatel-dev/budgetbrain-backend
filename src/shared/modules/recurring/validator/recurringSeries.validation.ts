import { z } from 'zod';
import {
  requiredText,
  currencyField,
  amountField,
  uuidField,
  enumField,
  requiredDate,
  optionalDate,
} from '@shared/validation';

export const createRecurringSeriesSchema = z.object({
  merchant: requiredText('merchant'),
  categoryId: uuidField().optional(),
  amount: amountField(),
  currency: currencyField(true),
  cadence: enumField(['weekly', 'monthly', 'yearly'] as const),
  nextDueDate: requiredDate,
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
});

export const updateRecurringSeriesSchema = z.object({
  amount: amountField().optional(),
  categoryId: uuidField().optional(),
  nextDueDate: optionalDate,
  active: z.boolean().optional(),
  reminderDaysBefore: z.number().int().min(0).max(30).optional(),
});
