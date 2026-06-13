import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../middleware/auth';
import * as transactionService from '../services/transactionService';
import { generatePdfReport } from '../services/pdfService';

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
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = z
      .object({ startDate: z.string().optional(), endDate: z.string().optional() })
      .parse(req.query);

    const buffer = await generatePdfReport(
      (req as AuthRequest).userId!,
      startDate,
      endDate
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=expenseflow-report.pdf');
    res.send(buffer);
  })
);

export default router;
