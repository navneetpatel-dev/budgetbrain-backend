import { z } from 'zod';

export const createGoalSchema = z.object({
  name: z.string(),
  type: z.enum(['emergency_fund', 'vacation', 'car', 'home', 'investments', 'other']),
  targetAmount: z.number().positive(),
  currency: z.string().length(3).optional(),
  targetDate: z.string().optional(),
});

export const updateGoalSchema = z.object({
  name: z.string().optional(),
  targetAmount: z.number().positive().optional(),
  targetDate: z.string().optional(),
});

export const contributeGoalSchema = z.object({
  amount: z.number().positive(),
  notes: z.string().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
