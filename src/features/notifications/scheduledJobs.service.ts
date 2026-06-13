import cron from 'node-cron';
import { Op } from 'sequelize';
import { User, Transaction, Notification } from '../../models';
import { createNotification } from './notification.service';

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

  console.log('Scheduled jobs started');
}
