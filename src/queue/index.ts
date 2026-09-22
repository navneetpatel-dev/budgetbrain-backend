import type { Worker } from 'bullmq';
import { createLogger } from '@shared/logging';
import { startEmailWorker } from './workers/email.worker';
import { startReceiptExtractionWorker } from './workers/receiptExtraction.worker';
import { startReportWorker } from './workers/report.worker';

const log = createLogger('system');

let workers: Worker[] = [];

/**
 * Starts the BullMQ workers for all three queues (email, receipt-extraction, report).
 * Call this from exactly one deployed instance — gated by ENABLE_QUEUE_WORKERS, see
 * src/web/index.ts. Running it in more than one process is safe (BullMQ's Redis-backed
 * locking still processes each job once) but wastes CPU/memory in the other processes.
 */
export function startWorkers(): void {
  if (workers.length > 0) return;
  workers = [startEmailWorker(), startReceiptExtractionWorker(), startReportWorker()];
  log.info('Queue workers started', { queues: ['email', 'receipt-extraction', 'report'] });
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
}

export { emailQueue, receiptExtractionQueue, reportQueue } from './queues';
export type { EmailJobData, ReceiptExtractionJobData, ReportJobData, ReportJobResult } from './queues';
