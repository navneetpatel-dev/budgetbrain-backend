import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import * as reportService from '@shared/modules/reports/service/report.service';
import { generatePdfReport } from '@shared/modules/reports/service/pdf.service';
import type { ReportFilters } from '@shared/modules/reports/reports.types';

export async function getRecap(req: Request, res: Response) {
  const recap = await reportService.getMonthlyRecap((req as AuthRequest).userId!);
  successResponse(res, recap);
}

export async function exportCsv(req: Request, res: Response) {
  const filters = req.query as unknown as ReportFilters;
  const csv = await reportService.generateCsvReport(
    (req as AuthRequest).userId!,
    filters
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=budgetbrain-report.csv');
  res.send(csv);
}

export async function exportPdf(req: Request, res: Response) {
  const filters = req.query as unknown as ReportFilters;
  const buffer = await generatePdfReport((req as AuthRequest).userId!, filters);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=budgetbrain-report.pdf');
  res.send(buffer);
}

export async function exportExcel(req: Request, res: Response) {
  const filters = req.query as unknown as ReportFilters;
  const buffer = await reportService.generateExcelReport((req as AuthRequest).userId!, filters);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename=budgetbrain-report.xlsx');
  res.send(buffer);
}
