import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as reportService from '../service/report.service';
import { generatePdfReport } from '../service/pdf.service';
import type { DateRangeInput } from '../../../shared/types';

export async function getRecap(req: Request, res: Response) {
  const recap = await reportService.getMonthlyRecap((req as AuthRequest).userId!);
  successResponse(res, recap);
}

export async function exportCsv(req: Request, res: Response) {
  const { startDate, endDate } = req.query as DateRangeInput;
  const csv = await reportService.generateCsvReport(
    (req as AuthRequest).userId!,
    startDate,
    endDate
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=budgetbrain-report.csv');
  res.send(csv);
}

export async function exportPdf(req: Request, res: Response) {
  const { startDate, endDate } = req.query as DateRangeInput;
  const buffer = await generatePdfReport((req as AuthRequest).userId!, startDate, endDate);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=budgetbrain-report.pdf');
  res.send(buffer);
}
