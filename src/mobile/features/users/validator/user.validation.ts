import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  urlField,
  amountField,
  financialGoalsField,
  enumField,
} from '../../../../shared/validation';

export const updateProfileSchema = z.object({
  name: optionalText('name'),
  country: optionalText('country'),
  currency: currencyField(true),
  avatarUrl: urlField('avatarUrl'),
  theme: enumField(['light', 'dark', 'system'] as const).optional(),
  accent: enumField(['indigo', 'emerald', 'ocean', 'rose', 'violet'] as const).optional(),
});

export const onboardingSchema = z.object({
  name: requiredText('name'),
  country: requiredText('country'),
  currency: currencyField(),
  financialGoals: financialGoalsField(),
  salaryRange: requiredText('salaryRange'),
  monthlySavingsTarget: amountField(),
});
