import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
  uuidField,
  enumField,
} from '../../../../validation';

export const listIncomeSchema = dateRangeSchema.merge(paginationSchema);

export const createIncomeSchema = z.object({
  amount: amountField(),
  currency: currencyField(true),
  incomeSourceId: uuidField(),
  notes: optionalText('notes'),
  date: requiredDate,
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const updateIncomeSchema = z.object({
  amount: amountField().optional(),
  notes: optionalText('notes'),
  date: optionalDate,
  incomeSourceId: uuidField().optional(),
});

export const createSourceSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['salary', 'freelancing', 'investments', 'rental', 'other'] as const),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});
