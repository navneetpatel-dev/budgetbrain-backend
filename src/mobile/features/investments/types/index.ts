import { z } from 'zod';
import { createInvestmentSchema, updateInvestmentSchema } from '../validator/investment.validation';

export type CreateInvestmentInput = z.infer<typeof createInvestmentSchema>;
export type UpdateInvestmentInput = z.infer<typeof updateInvestmentSchema>;

import type { Investment } from '../../../../shared/models';

export interface EnrichedInvestment {
  id: string;
  userId: string;
  name: string;
  type: Investment['type'];
  symbol: string | null;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  currency: string;
  purchaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
  currentValue: number;
  gainLoss: number;
}
