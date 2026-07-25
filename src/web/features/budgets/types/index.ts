import { z } from 'zod';
import { createBudgetSchema, updateBudgetSchema } from '../validator/budget.validation';

export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

import type { Budget, Category } from '../../../../shared/models';

export type BudgetWithSpent = ReturnType<Budget['toJSON']> & {
  category?: Category | null;
  spent: number;
};
