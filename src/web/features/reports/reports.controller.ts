import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import { AppError } from '@shared/errors';
import { hasPermission, Permissions } from '@core/permissions/permissions';
import { getEntitlementForUser } from '@shared/modules/subscriptions';
import * as reportService from '@shared/modules/reports/service/report.service';
import type { ReportExportFormat } from '@shared/modules/reports/service/report.service';
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

/** csv is free; excel/pdf require Pro — mirrors requireEntitlement's exact check, done inline
 * here since the format (and therefore whether entitlement is even required) is in the
 * body, not decidable at route-registration time the way the three GET routes above are. */
export async function exportAsync(req: Request, res: Response) {
  const authReq = req as AuthRequest;
  const { format, filters } = req.body as { format: ReportExportFormat; filters?: ReportFilters };

  if (format !== 'csv' && !hasPermission(authReq.user!.role, Permissions.ENTITLEMENT_PRO)) {
    const entitlement = await getEntitlementForUser(authReq.userId!, 'pro');
    if (!entitlement.isEntitled) {
      throw new AppError(402, 'Active subscription required for this export format', 'ENTITLEMENT_REQUIRED');
    }
  }

  const jobId = await reportService.enqueueReportExport(authReq.userId!, format, filters ?? {});
  successResponse(res, { jobId });
}

export async function getExportStatus(req: Request, res: Response) {
  const status = await reportService.getReportJobStatus((req as AuthRequest).userId!, req.params.jobId as string);
  successResponse(res, status);
}
