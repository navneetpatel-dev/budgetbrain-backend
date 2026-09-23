import { Worker } from 'bullmq';
import { queueConnection } from '../connection';
import { createLogger } from '@shared/logging';
import { sendPushToUser } from '@modules/notifications/service/push.service';
import type { PushJobData } from '../queues';

const log = createLogger('system');

export function startPushWorker(): Worker<PushJobData> {
  return new Worker<PushJobData>(
    'push',
    async (job) => {
      const { userId, title, body, data } = job.data;
      await sendPushToUser(userId, title, body, data);
    },
    { connection: queueConnection }
  )
    .on('failed', (job, err) => {
      log.error('Push job failed', { jobId: job?.id, userId: job?.data.userId, message: err.message });
    })
    .on('error', (err) => {
      log.warn('Push worker connection error', { message: err.message });
    });
}
