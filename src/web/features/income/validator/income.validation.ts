import { z } from 'zod';
import { dateRangeSchema, paginationSchema } from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  requiredDate,
  optionalDate,
  amountField,
} from '../../../../validation';

export const listIncomeSchema = dateRangeSchema.merge(paginationSchema);

export const createIncomeSchema = z.object({
  amount: amountField(),
  currency: currencyField(true),
  incomeSourceId: z.string().uuid().optional(),
  notes: optionalText('notes'),
  date: requiredDate,
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const updateIncomeSchema = z.object({
  amount: amountField().optional(),
  notes: optionalText('notes'),
  date: optionalDate,
  incomeSourceId: z.string().uuid().optional(),
});

export const createSourceSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['salary', 'freelancing', 'investments', 'rental', 'other']),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});
