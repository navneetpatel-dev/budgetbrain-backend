import type { Worker } from 'bullmq';
import { createLogger } from '@shared/logging';
import { startEmailWorker } from './workers/email.worker';
import { startReceiptExtractionWorker } from './workers/receiptExtraction.worker';
import { startReportWorker } from './workers/report.worker';
import { startPushWorker } from './workers/push.worker';

const log = createLogger('system');

let workers: Worker[] = [];

/**
 * Starts the BullMQ workers for all four queues (email, receipt-extraction, report, push).
 * Call this from exactly one deployed instance — gated by ENABLE_QUEUE_WORKERS, see
 * src/web/index.ts. Running it in more than one process is safe (BullMQ's Redis-backed
 * locking still processes each job once) but wastes CPU/memory in the other processes.
 */
export function startWorkers(): void {
  if (workers.length > 0) return;
  workers = [startEmailWorker(), startReceiptExtractionWorker(), startReportWorker(), startPushWorker()];
  log.info('Queue workers started', { queues: ['email', 'receipt-extraction', 'report', 'push'] });
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
}

export { emailQueue, receiptExtractionQueue, reportQueue, pushQueue } from './queues';
export type {
  EmailJobData,
  ReceiptExtractionJobData,
  ReportJobData,
  ReportJobResult,
  PushJobData,
} from './queues';
