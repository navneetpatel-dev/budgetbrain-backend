import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  moneyValueField,
  optionalMoneyValueField,
  accountLast4Field,
  enumField,
} from '../../../../validation';

export const createAccountSchema = z.object({
  name: requiredText('entityName'),
  type: enumField(['bank', 'credit_card', 'cash', 'wallet'] as const),
  institution: optionalText('institution'),
  accountNumberLast4: accountLast4Field(),
  balance: moneyValueField({ allowNegative: true }),
  creditLimit: optionalMoneyValueField(),
  currency: currencyField(true),
});

export const updateAccountSchema = z.object({
  name: optionalText('entityName'),
  balance: optionalMoneyValueField({ allowNegative: true }),
  creditLimit: optionalMoneyValueField(),
  isActive: z.boolean().optional(),
});
