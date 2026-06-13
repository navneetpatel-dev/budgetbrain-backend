import { z } from 'zod';

export const createInvestmentSchema = z.object({
  name: z.string(),
  type: z.enum(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other']),
  symbol: z.string().optional(),
  quantity: z.number().positive(),
  purchasePrice: z.number().positive(),
  currentPrice: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  purchaseDate: z.string(),
});

export const updateInvestmentSchema = z.object({
  currentPrice: z.number().positive(),
  quantity: z.number().positive().optional(),
});

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;
