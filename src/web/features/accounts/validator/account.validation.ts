import { z } from 'zod';
import { optionalText, requiredText, currencyField, FieldLimits } from '../../../../validation';

export const createAccountSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['bank', 'credit_card', 'cash', 'wallet']),
  institution: optionalText('institution'),
  accountNumberLast4: z
    .string()
    .trim()
    .length(FieldLimits.accountNumberLast4.max)
    .optional(),
  balance: z.number(),
  creditLimit: z.number().optional(),
  currency: currencyField(true),
});

export const updateAccountSchema = z.object({
  name: optionalText('entityName'),
  balance: z.number().optional(),
  creditLimit: z.number().optional(),
  isActive: z.boolean().optional(),
});
