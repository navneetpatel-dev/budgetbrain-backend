import { Worker } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { queueConnection } from '../connection';
import { createLogger } from '@shared/logging';
import { uploadGeneratedReport } from '@core/storage/s3.service';
import * as reportService from '@modules/reports/service/report.service';
import { generatePdfReport } from '@modules/reports/service/pdf.service';
import type { ReportFilters } from '@modules/reports/reports.types';
import type { ReportJobData, ReportJobResult } from '../queues';

const log = createLogger('system');

const CONTENT_TYPE: Record<ReportJobData['format'], string> = {
  csv: 'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const EXTENSION: Record<ReportJobData['format'], string> = {
  csv: 'csv',
  excel: 'xlsx',
  pdf: 'pdf',
};

export function startReportWorker(): Worker<ReportJobData, ReportJobResult> {
  return new Worker<ReportJobData, ReportJobResult>(
    'report',
    async (job): Promise<ReportJobResult> => {
      const { userId, format, filters } = job.data;
      const typedFilters = filters as ReportFilters;

      let buffer: Buffer;
      if (format === 'csv') {
        const csv = await reportService.generateCsvReport(userId, typedFilters);
        buffer = Buffer.from(csv, 'utf-8');
      } else if (format === 'excel') {
        buffer = await reportService.generateExcelReport(userId, typedFilters);
      } else {
        buffer = await generatePdfReport(userId, typedFilters);
      }

      const fileName = `budgetbrain-report-${uuidv4()}.${EXTENSION[format]}`;
      const { key } = await uploadGeneratedReport(buffer, fileName, CONTENT_TYPE[format]);
      return { s3Key: key, fileName };
    },
    { connection: queueConnection }
  )
    .on('failed', (job, err) => {
      log.error('Report generation job failed', {
        jobId: job?.id,
        userId: job?.data.userId,
        format: job?.data.format,
        message: err.message,
      });
    })
    .on('error', (err) => {
      log.warn('Report worker connection error', { message: err.message });
    });
}
