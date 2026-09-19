import { User } from '@database/models';
import { generateExcelReport } from './report.service';
import { sendEmail } from '@shared/services/email.service';

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
 * Cron entry point: emails every monthly-digest-opted-in user an Excel report of the
 * previous calendar month, via the same generateExcelReport() the on-demand report
 * endpoint already uses. A per-user failure is logged and skipped, not fatal to the batch.
 */
export async function sendMonthlyReportDigests(): Promise<{ sent: number; failed: number }> {
  const { startDate, endDate, label } = previousMonthRange();
  const users = await User.findAll({ where: { monthlyDigestOptIn: true } });

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const buffer = await generateExcelReport(user.id, { startDate, endDate });
      await sendEmail(
        user.email,
        `Your BudgetBrain report for ${label}`,
        `<p>Hi${user.name ? ` ${user.name}` : ''},</p><p>Attached is your BudgetBrain spending report for ${label}.</p>`,
        [
          {
            filename: `budgetbrain-report-${startDate}-to-${endDate}.xlsx`,
            content: buffer,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
        ]
      );
      sent += 1;
    } catch (err) {
      console.error(`[reportDigest] failed to send monthly digest to user ${user.id}:`, err);
      failed += 1;
    }
  }

  return { sent, failed };
}
