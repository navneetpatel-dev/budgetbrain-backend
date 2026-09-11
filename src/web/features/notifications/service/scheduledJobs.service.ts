import cron from 'node-cron';
import { Op } from 'sequelize';
import { User, Transaction, Notification } from '../../../../shared/models';
import { createNotification } from './notification.service';
import { getWeeklySpendComparison } from '../../expenses/service/transaction.service';
import { sendBillDueReminders } from '../../recurring/service/recurringSeries.service';

export function startScheduledJobs(): void {
  // Daily reminder at 9:00 AM server time
  cron.schedule('0 9 * * *', async () => {
    try {
      const users = await User.findAll({ attributes: ['id'] });
      for (const user of users) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const loggedToday = await Transaction.count({
          where: { userId: user.id, createdAt: { [Op.gte]: today } },
        });
        if (loggedToday === 0) {
          const recent = await Notification.findOne({
            where: {
              userId: user.id,
              type: 'daily_reminder',
              sentAt: { [Op.gte]: today },
            },
          });
          if (!recent) {
            await createNotification(
              user.id,
              'daily_reminder',
              'Log your expenses',
              'Take a moment to record today\'s spending and stay on track.',
              undefined,
              true
            );
          }
        }
      }
    } catch (err) {
      console.error('[cron] daily_reminder failed:', err);
    }
  });

  // Recurring expense check — 1st of month at 8:00 AM
  cron.schedule('0 8 1 * *', async () => {
    try {
      const recurring = await Transaction.findAll({
        where: { isRecurring: true, type: 'expense' },
        limit: 500,
      });

      for (const tx of recurring) {
        await createNotification(
          tx.userId,
          'recurring_expense',
          'Recurring expense due',
          `Don't forget: ${tx.merchant ?? 'Recurring expense'} — ₹${tx.amount}`,
          { transactionId: tx.id },
          true
        );
      }
    } catch (err) {
      console.error('[cron] recurring_expense failed:', err);
    }
  });

  // Weekly spending digest — Monday 9:00 AM server time
  cron.schedule('0 9 * * 1', async () => {
    try {
      const users = await User.findAll({ where: { weeklyDigestOptIn: true }, attributes: ['id'] });
      for (const user of users) {
        const { thisWeek, lastWeek } = await getWeeklySpendComparison(user.id);
        const changeText =
          lastWeek > 0
            ? `${thisWeek >= lastWeek ? 'up' : 'down'} ${Math.round(
                (Math.abs(thisWeek - lastWeek) / lastWeek) * 100
              )}% vs last week`
            : 'no spending logged last week';

        await createNotification(
          user.id,
          'weekly_digest',
          'Your weekly spending recap',
          `You spent ₹${thisWeek.toFixed(2)} this week (${changeText}).`,
          { thisWeek, lastWeek }
        );
      }
    } catch (err) {
      console.error('[cron] weekly_digest failed:', err);
    }
  });

  // Upcoming bill reminders — daily 9:30 AM server time
  cron.schedule('30 9 * * *', async () => {
    try {
      await sendBillDueReminders();
    } catch (err) {
      console.error('[cron] bill_due failed:', err);
    }
  });

  console.log('Scheduled jobs started');
}
