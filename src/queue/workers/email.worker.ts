import { Worker } from 'bullmq';
import { queueConnection } from '../connection';
import { createLogger } from '@shared/logging';
import {
  sendOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendFamilyInviteEmail,
} from '@core/mail/email.service';
import type { EmailJobData } from '../queues';

const log = createLogger('system');

export function startEmailWorker(): Worker<EmailJobData> {
  return new Worker<EmailJobData>(
    'email',
    async (job) => {
      const { to, kind, payload } = job.data;
      switch (kind) {
        case 'otp':
          if (!payload.otp) throw new Error('email job "otp" missing payload.otp');
          await sendOtpEmail(to, payload.otp);
          return;
        case 'verify':
          if (!payload.token) throw new Error('email job "verify" missing payload.token');
          await sendVerificationEmail(to, payload.token);
          return;
        case 'reset':
          if (!payload.token) throw new Error('email job "reset" missing payload.token');
          await sendPasswordResetEmail(to, payload.token);
          return;
        case 'family_invite':
          if (!payload.token) throw new Error('email job "family_invite" missing payload.token');
          if (!payload.groupName) throw new Error('email job "family_invite" missing payload.groupName');
          if (!payload.inviterName) throw new Error('email job "family_invite" missing payload.inviterName');
          await sendFamilyInviteEmail(to, payload.token, payload.groupName, payload.inviterName);
          return;
        default:
          throw new Error(`Unknown email job kind: ${kind}`);
      }
    },
    { connection: queueConnection }
  )
    .on('failed', (job, err) => {
      log.error('Email job failed', { jobId: job?.id, kind: job?.data.kind, message: err.message });
    })
    .on('error', (err) => {
      log.warn('Email worker connection error', { message: err.message });
    });
}
