import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { logAudit } from '../services/auditService';

const router = Router();
router.use(authenticate);

const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional(),
  incomeSourceId: z.string().uuid().optional(),
  notes: z.string().optional(),
  merchant: z.string().optional(),
  date: z.string(),
  paymentMethod: z.enum(['cash', 'card', 'upi', 'bank_transfer', 'other']).optional(),
  isRecurring: z.boolean().optional(),
  recurringRule: z.string().optional(),
});

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const data = await transactionService.getDashboard((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = z
      .object({
        type: z.enum(['expense', 'income']).optional(),
        categoryId: z.string().uuid().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
        page: z.coerce.number().optional(),
        limit: z.coerce.number().optional(),
      })
      .parse(req.query);

    const data = await transactionService.listTransactions((req as AuthRequest).userId!, filters);
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = transactionSchema.parse(req.body);
    const transaction = await transactionService.createTransaction(
      (req as AuthRequest).userId!,
      data
    );
    await logAudit(req as AuthRequest, 'create', 'transaction', transaction?.id);
    successResponse(res, transaction, 201);
  })
);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q } = z.object({ q: z.string().min(1) }).parse(req.query);
    const data = await transactionService.globalSearch((req as AuthRequest).userId!, q);
    successResponse(res, data);
  })
);

router.post(
  '/:id/duplicate',
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.duplicateTransaction(
      (req as AuthRequest).userId!,
      String(req.params.id)
    );
    successResponse(res, transaction, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = transactionSchema.partial().parse(req.body);
    const transaction = await transactionService.updateTransaction(
      (req as AuthRequest).userId!,
      String(req.params.id),
      data
    );
    successResponse(res, transaction);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await transactionService.deleteTransaction((req as AuthRequest).userId!, String(req.params.id));
    successResponse(res, { message: 'Transaction deleted' });
  })
);

export default router;
