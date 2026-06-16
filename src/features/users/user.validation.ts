import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().length(3).optional(),
  avatarUrl: z.string().url().optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  accent: z.enum(['indigo', 'emerald', 'ocean', 'rose', 'violet']).optional(),
});

export const onboardingSchema = z.object({
  name: z.string(),
  country: z.string(),
  currency: z.string().length(3),
  financialGoals: z.array(z.string()),
  salaryRange: z.string(),
  monthlySavingsTarget: z.number().positive(),
});
