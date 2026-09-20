import { z } from 'zod';
import {
  dateRangeObjectSchema,
  paginationSchema,
  refineDateRangeOrder,
} from '@shared/validation';
import {
  optionalText,
  requiredText,
  currencyField,
  transactionDate,
  optionalTransactionDate,
  amountField,
  optionalMoneyValueField,
  uuidField,
  enumField,
} from '@shared/validation';

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
  /** `netAmount` is never accepted from the client — always server-computed from amount - taxWithheld. */
  taxWithheld: optionalMoneyValueField(),
});

export const updateIncomeSchema = z.object({
  amount: amountField().optional(),
  notes: optionalText('notes'),
  date: optionalTransactionDate,
  incomeSourceId: uuidField().optional(),
  taxWithheld: optionalMoneyValueField(),
});

export const allocateIncomeSchema = z.object({
  allocations: z
    .array(
      z.object({
        financialAccountId: uuidField(),
        amount: amountField(),
      })
    )
    .min(1, 'At least one allocation is required'),
});

export const createSourceSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['salary', 'freelancing', 'investments', 'rental', 'other'] as const),
  isRecurring: z.boolean().optional(),
  recurringRule: optionalText('recurringRule'),
});
