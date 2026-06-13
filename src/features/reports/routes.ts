import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../../middleware/auth';
import * as reportService from './report.service';
import { generatePdfReport } from './pdf.service';
import { dateRangeSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/csv',
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
    const csv = await reportService.generateCsvReport(
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
    const { startDate, endDate } = dateRangeSchema.parse(req.query);
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
