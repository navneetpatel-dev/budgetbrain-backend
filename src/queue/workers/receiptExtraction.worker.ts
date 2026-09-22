import { Worker } from 'bullmq';
import { queueConnection } from '../connection';
import { createLogger } from '@shared/logging';
import { getSignedDownloadUrl } from '@core/storage/s3.service';
import { extractReceiptData } from '@shared/ai';
import { saveReceiptExtraction } from '@modules/expenses/service/attachments.service';
import { env } from '@config/env';
import type { ReceiptExtractionJobData } from '../queues';

const log = createLogger('system');

export function startReceiptExtractionWorker(): Worker<ReceiptExtractionJobData> {
  return new Worker<ReceiptExtractionJobData>(
    'receipt-extraction',
    async (job) => {
      if (!env.OPENAI_API_KEY) return;
      const { attachmentId, s3Key, s3Url } = job.data;
      const imageUrl = await getSignedDownloadUrl(s3Key, s3Url);
      const extracted = await extractReceiptData({ apiKey: env.OPENAI_API_KEY, imageUrl });
      if (extracted) {
        await saveReceiptExtraction(attachmentId, extracted);
      }
    },
    { connection: queueConnection }
  )
    .on('failed', (job, err) => {
      log.warn('Receipt extraction job failed', {
        jobId: job?.id,
        attachmentId: job?.data.attachmentId,
        message: err.message,
      });
    })
    .on('error', (err) => {
      log.warn('Receipt extraction worker connection error', { message: err.message });
    });
}
