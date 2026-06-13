import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as transactionService from './transaction.service';
import * as dashboardService from '../dashboard/dashboard.service';
import {
  transactionSchema,
  listTransactionsSchema,
  searchQuerySchema,
} from './transaction.validation';

const router = Router();
router.use(authenticate);

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const data = await dashboardService.getDashboard((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listTransactionsSchema.parse(req.query);
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
    successResponse(res, transaction, 201);
  })
);

router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { q, page, limit } = searchQuerySchema.parse(req.query);
    const data = await transactionService.globalSearch((req as AuthRequest).userId!, q, { page, limit });
    successResponse(res, data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const transaction = await transactionService.getTransaction(
      (req as AuthRequest).userId!,
      String(req.params.id)
    );
    successResponse(res, transaction);
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
