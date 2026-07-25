import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as budgetService from '../service/budget.service';
import type { CreateBudgetInput, UpdateBudgetInput } from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listBudgets(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await budgetService.listBudgets((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createBudget(req: Request, res: Response) {
  const budget = await budgetService.createBudget(
    (req as AuthRequest).userId!,
    req.body as CreateBudgetInput
  );
  successResponse(res, budget, 201);
}

export async function getBudget(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const budget = await budgetService.getBudget((req as AuthRequest).userId!, id);
  successResponse(res, budget);
}

export async function updateBudget(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const budget = await budgetService.updateBudget(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateBudgetInput
  );
  successResponse(res, budget);
}

export async function deleteBudget(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await budgetService.deleteBudget((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Budget deleted' });
}
