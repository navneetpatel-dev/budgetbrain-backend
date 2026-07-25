import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  urlField,
  amountField,
  FieldLimits,
} from '../../../../validation';

export const updateProfileSchema = z.object({
  name: optionalText('name'),
  country: optionalText('country'),
  currency: currencyField(true),
  avatarUrl: urlField('avatarUrl'),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.enum(['indigo', 'emerald', 'ocean', 'rose', 'violet']).optional(),
});

export const onboardingSchema = z.object({
  name: requiredText('name'),
  country: requiredText('country'),
  currency: currencyField(),
  financialGoals: z
    .array(
      z
        .string()
        .trim()
        .min(FieldLimits.financialGoal.min)
        .max(FieldLimits.financialGoal.max)
    )
    .max(20),
  salaryRange: requiredText('salaryRange'),
  monthlySavingsTarget: amountField(),
});
