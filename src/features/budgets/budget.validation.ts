import { z } from 'zod';

export const createBudgetSchema = z.object({
  name: z.string(),
  type: z.enum(['monthly', 'weekly', 'category']),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
});

export const updateBudgetSchema = z.object({
  name: z.string().optional(),
  amount: z.number().positive().optional(),
  alertThreshold: z.number().min(1).max(100).optional(),
  endDate: z.string().optional(),
});

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
