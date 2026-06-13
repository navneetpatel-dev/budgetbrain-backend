import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';

const router = Router();
router.use(authenticate);

router.get(
  '/csv',
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = z
      .object({ startDate: z.string().optional(), endDate: z.string().optional() })
      .parse(req.query);

    const csv = await transactionService.generateCsvReport(
      (req as AuthRequest).userId!,
      startDate,
      endDate
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenseflow-report.csv');
    res.send(csv);
  })
);

router.get(
  '/pdf',
  requirePremium,
  asyncHandler(async (_req, res) => {
    successResponse(res, {
      message: 'PDF report generation requires S3 integration — coming soon',
    });
  })
);

export default router;
