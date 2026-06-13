import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { Goal, GoalContribution } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const goals = await transactionService.listGoals((req as AuthRequest).userId!);
    successResponse(res, goals);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(['emergency_fund', 'vacation', 'car', 'home', 'investments', 'other']),
        targetAmount: z.number().positive(),
        currency: z.string().length(3).optional(),
        targetDate: z.string().optional(),
      })
      .parse(req.body);

    const goal = await transactionService.createGoal((req as AuthRequest).userId!, data);
    successResponse(res, goal, 201);
  })
);

router.post(
  '/:id/contribute',
  asyncHandler(async (req, res) => {
    const { amount, notes } = z
      .object({ amount: z.number().positive(), notes: z.string().optional() })
      .parse(req.body);

    const userId = (req as AuthRequest).userId!;
    const goal = await Goal.findOne({ where: { id: req.params.id, userId } });
    if (!goal) throw new AppError(404, 'Goal not found');

    const contribution = await GoalContribution.create({
      goalId: goal.id,
      userId,
      amount,
      notes: notes ?? null,
      contributedAt: new Date(),
    });

    const newAmount = Number(goal.currentAmount) + amount;
    await goal.update({
      currentAmount: newAmount,
      completedAt: newAmount >= Number(goal.targetAmount) ? new Date() : null,
    });

    successResponse(res, { contribution, goal }, 201);
  })
);

export default router;
