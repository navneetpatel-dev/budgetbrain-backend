import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { IncomeSource } from '../models';
import { AppError } from '../utils/errors';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(req.query);

    const data = await transactionService.listTransactions((req as AuthRequest).userId!, {
      ...filters,
      type: 'income',
    });
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        amount: z.number().positive(),
        currency: z.string().length(3).optional(),
        incomeSourceId: z.string().uuid().optional(),
        notes: z.string().optional(),
        date: z.string(),
        isRecurring: z.boolean().optional(),
        recurringRule: z.string().optional(),
      })
      .parse(req.body);

    const transaction = await transactionService.createTransaction(
      (req as AuthRequest).userId!,
      { ...data, type: 'income' }
    );
    successResponse(res, transaction, 201);
  })
);

router.get(
  '/sources',
  asyncHandler(async (req, res) => {
    const sources = await IncomeSource.findAll({
      where: { userId: (req as AuthRequest).userId! },
      order: [['createdAt', 'DESC']],
    });
    successResponse(res, sources);
  })
);

router.post(
  '/sources',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        name: z.string(),
        type: z.enum(['salary', 'freelancing', 'investments', 'rental', 'other']),
        isRecurring: z.boolean().optional(),
        recurringRule: z.string().optional(),
      })
      .parse(req.body);

    const source = await IncomeSource.create({
      userId: (req as AuthRequest).userId!,
      ...data,
    });
    successResponse(res, source, 201);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await transactionService.deleteTransaction((req as AuthRequest).userId!, String(req.params.id));
    successResponse(res, { message: 'Income deleted' });
  })
);

export default router;
