import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { Budget } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const budgets = await transactionService.listBudgets((req as AuthRequest).userId!);
    successResponse(res, budgets);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(['monthly', 'weekly', 'category']),
        amount: z.number().positive(),
        currency: z.string().length(3).optional(),
        categoryId: z.string().uuid().optional(),
        startDate: z.string(),
        endDate: z.string().optional(),
        alertThreshold: z.number().min(1).max(100).optional(),
      })
      .parse(req.body);

    const budget = await transactionService.createBudget((req as AuthRequest).userId!, data);
    successResponse(res, budget, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string().optional(),
        amount: z.number().positive().optional(),
        alertThreshold: z.number().min(1).max(100).optional(),
        endDate: z.string().optional(),
      })
      .parse(req.body);

    const budget = await Budget.findOne({
      where: { id: req.params.id, userId: (req as AuthRequest).userId! },
    });
    if (!budget) throw new AppError(404, 'Budget not found');

    await budget.update({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.alertThreshold !== undefined && { alertThreshold: data.alertThreshold }),
      ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
    });
    successResponse(res, budget);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const budget = await Budget.findOne({
      where: { id: req.params.id, userId: (req as AuthRequest).userId! },
    });
    if (!budget) throw new AppError(404, 'Budget not found');
    await budget.destroy();
    successResponse(res, { message: 'Budget deleted' });
  })
);

export default router;
