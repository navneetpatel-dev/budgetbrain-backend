import { Queue } from 'bullmq';
import { queueConnection } from './connection';
import { createLogger } from '@shared/logging';

const log = createLogger('system');

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

// BullMQ's Queue/Worker are EventEmitters — an unhandled 'error' event (e.g. Redis
// unreachable) crashes the process, same reason @core/cache/redis.client attaches one.
function logConnectionErrors(queueName: string, queue: Queue): void {
  queue.on('error', (err) => {
    log.warn(`Queue "${queueName}" connection error`, {
      message: err instanceof Error ? err.message : String(err),
    });
  });
}

export interface EmailJobData {
  to: string;
  kind: 'otp' | 'verify' | 'reset' | 'family_invite' | 'monthly_digest';
  payload: {
    otp?: string;
    token?: string;
    groupName?: string;
    inviterName?: string;
    name?: string | null;
    periodLabel?: string;
    attachmentFilename?: string;
    attachmentContentType?: string;
    /** Base64-encoded — BullMQ job data is JSON over Redis, so the raw xlsx Buffer
     * generateExcelReport returns can't be passed through as-is. */
    attachmentBase64?: string;
  };
}

export const emailQueue = new Queue<EmailJobData>('email', {
  connection: queueConnection,
  defaultJobOptions,
});
logConnectionErrors('email', emailQueue);

export interface ReceiptExtractionJobData {
  attachmentId: string;
  s3Key: string;
  s3Url: string;
}

export const receiptExtractionQueue = new Queue<ReceiptExtractionJobData>('receipt-extraction', {
  connection: queueConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
});
logConnectionErrors('receipt-extraction', receiptExtractionQueue);

export interface ReportJobData {
  userId: string;
  format: 'csv' | 'excel' | 'pdf';
  filters: Record<string, unknown>;
}

export interface ReportJobResult {
  s3Key: string;
  fileName: string;
}

export const reportQueue = new Queue<ReportJobData, ReportJobResult>('report', {
  connection: queueConnection,
  defaultJobOptions,
});
logConnectionErrors('report', reportQueue);

export interface PushJobData {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export const pushQueue = new Queue<PushJobData>('push', {
  connection: queueConnection,
  defaultJobOptions,
});
logConnectionErrors('push', pushQueue);

/** Knowledge base (plan T4.2, T4.3): importer runs and pack builds, one at a time. */
export type KnowledgeBaseJobData =
  | { type: 'import'; importer: string; file?: string }
  | { type: 'build'; country?: string };

export const knowledgeBaseQueue = new Queue<KnowledgeBaseJobData>('knowledge-base', {
  connection: queueConnection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
});
logConnectionErrors('knowledge-base', knowledgeBaseQueue);
