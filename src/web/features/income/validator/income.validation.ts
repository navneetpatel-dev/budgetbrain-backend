import { z } from 'zod';
import {
  dateRangeObjectSchema,
  paginationSchema,
  refineDateRangeOrder,
} from '../../../shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  transactionDate,
  optionalTransactionDate,
  amountField,
  uuidField,
  enumField,
} from '../../../../shared/validation';

export const listIncomeSchema = dateRangeObjectSchema
  .merge(paginationSchema)
  .extend({
    incomeSourceId: uuidField().optional(),
  })
  .superRefine(refineDateRangeOrder);

export const createIncomeSchema = z.object({
  amount: amountField(),
  currency: currencyField(true),
  incomeSourceId: uuidField(),
  notes: optionalText('notes'),
  date: transactionDate,
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});

export const updateIncomeSchema = z.object({
  amount: amountField().optional(),
  notes: optionalText('notes'),
  date: optionalTransactionDate,
  incomeSourceId: uuidField().optional(),
});

export const createSourceSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['salary', 'freelancing', 'investments', 'rental', 'other'] as const),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});
