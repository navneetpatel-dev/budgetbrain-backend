import { User } from '@database/models';
import { generateExcelReport } from './report.service';
import { emailQueue } from '@queue/queues';

function previousMonthRange(): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    label,
  };
}

/**
 * Cron entry point: enqueues a monthly-digest email (Excel report of the previous
 * calendar month, via the same generateExcelReport() the on-demand report endpoint
 * already uses) for every opted-in user, onto the existing email queue — not sent
 * synchronously here, so this cron process isn't blocked on N sequential SMTP round
 * trips. A per-user generation/enqueue failure is logged and skipped, not fatal to
 * the batch.
 */
export async function sendMonthlyReportDigests(): Promise<{ sent: number; failed: number }> {
  const { startDate, endDate, label } = previousMonthRange();
  const users = await User.findAll({
    where: { monthlyDigestOptIn: true },
    attributes: ['id', 'email', 'name'],
  });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const buffer = await generateExcelReport(user.id, { startDate, endDate });
      await emailQueue.add('monthly_digest', {
        to: user.email,
        kind: 'monthly_digest',
        payload: {
          name: user.name,
          periodLabel: label,
          attachmentFilename: `budgetbrain-report-${startDate}-to-${endDate}.xlsx`,
          attachmentContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          attachmentBase64: buffer.toString('base64'),
        },
      });
      sent += 1;
    } catch (err) {
      console.error(`[reportDigest] failed to enqueue monthly digest for user ${user.id}:`, err);
      failed += 1;
    }
  }

  return { sent, failed };
}
