import { z } from 'zod';
import { createBudgetSchema, updateBudgetSchema } from './budgets.validator';

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

import type { Budget, BudgetRolloverMode, Category } from '@database/models';

export type BudgetWithSpent = ReturnType<Budget['toJSON']> & {
  category?: Category | null;
  spent: number;
  rolloverAmount: number;
  effectiveAmount: number;
  /** Server-computed, capped 0-100. Clients must render this, not divide spent/effectiveAmount themselves. */
  spentPercentage: number;
  rolloverMode: BudgetRolloverMode;
  rolloverStartedAt: Date | null;
};
