import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  investmentPurchaseDate,
  amountField,
  enumField,
  ValidationMessages as M,
} from '../../../../shared/validation';

const interestRateField = () =>
  z
    .number({ invalid_type_error: M.valueType })
    .finite(M.valueFinite)
    .min(0, M.valueMin(0))
    .max(100, M.valueMax(100))
    .optional();

export const createLoanSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['loan', 'credit_card', 'emi', 'other'] as const),
  principal: amountField(),
  interestRate: interestRateField(),
  emiAmount: amountField().optional(),
  currency: currencyField(true),
  startDate: investmentPurchaseDate,
  dueDayOfMonth: z.number().int().min(1).max(31).optional(),
  notes: optionalText('notes'),
});

export const updateLoanSchema = z.object({
  name: optionalText('entityName'),
  interestRate: interestRateField(),
  emiAmount: amountField().optional(),
  dueDayOfMonth: z.number().int().min(1).max(31).optional(),
  notes: optionalText('notes'),
  closed: z.boolean().optional(),
});

export const payLoanSchema = z.object({
  amount: amountField(),
  notes: optionalText('notes'),
});
