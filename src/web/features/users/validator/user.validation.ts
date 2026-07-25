import { z } from 'zod';
import {
  optionalText,
  requiredText,
  currencyField,
  urlField,
  amountField,
  financialGoalsField,
  ValidationMessages,
} from '../../../../validation';

export const updateProfileSchema = z.object({
  name: optionalText('name'),
  country: optionalText('country'),
  currency: currencyField(true),
  avatarUrl: urlField('avatarUrl'),
  theme: z.enum(['light', 'dark', 'system'], { errorMap: () => ({ message: ValidationMessages.enumInvalid }) }).optional(),
  accent: z.enum(['indigo', 'emerald', 'ocean', 'rose', 'violet'], { errorMap: () => ({ message: ValidationMessages.enumInvalid }) }).optional(),
});

export const onboardingSchema = z.object({
  name: requiredText('name'),
  country: requiredText('country'),
  currency: currencyField(),
  financialGoals: financialGoalsField(),
  salaryRange: requiredText('salaryRange'),
  monthlySavingsTarget: amountField(),
});
