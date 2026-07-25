import { z } from 'zod';
import { optionalText, requiredText, currencyField } from '../../../../validation';

export const createInvestmentSchema = z.object({
  name: requiredText('entityName'),
  type: z.enum(['stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other']),
  symbol: optionalText('symbol'),
  quantity: z.number().positive(),
  purchasePrice: z.number().positive(),
  currentPrice: z.number().positive().optional(),
  currency: currencyField(true),
  purchaseDate: z.string().min(1).max(40),
});

export const updateInvestmentSchema = z.object({
  currentPrice: z.number().positive(),
  quantity: z.number().positive().optional(),
});
