import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import * as goalService from '../service/goal.service';
import type {
  ContributeGoalInput,
  CreateGoalInput,
  UpdateGoalInput,
} from '../types';
import type { PaginationInput } from '../../../../shared/types';

export async function listGoals(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await goalService.listGoals((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createGoal(req: Request, res: Response) {
  const goal = await goalService.createGoal(
    (req as AuthRequest).userId!,
    req.body as CreateGoalInput
  );
  successResponse(res, goal, 201);
}

export async function getGoal(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const goal = await goalService.getGoal((req as AuthRequest).userId!, id);
  successResponse(res, goal);
}

export async function updateGoal(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const goal = await goalService.updateGoal(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateGoalInput
  );
  successResponse(res, goal);
}

export async function deleteGoal(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await goalService.deleteGoal((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Goal deleted' });
}

export async function contributeToGoal(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { amount, notes } = req.body as ContributeGoalInput;
  const result = await goalService.contributeToGoal(
    (req as AuthRequest).userId!,
    id,
    amount,
    notes
  );
  successResponse(res, result, 201);
}
