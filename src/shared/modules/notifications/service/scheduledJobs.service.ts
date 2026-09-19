import cron from 'node-cron';
import { Op } from 'sequelize';
import { User, Transaction, Notification, Subscription } from '@database/models';
import { createNotification } from './notification.service';
import { getWeeklySpendComparison } from '@shared/modules/expenses/service/transaction.service';
import { sendBillDueReminders } from '@shared/modules/recurring/service/recurringSeries.service';
import { detectRecurringPatternsForAllUsers } from '@shared/modules/recurring/service/recurringDetection.service';
import { fetchAndUpsertLiveRates } from '@shared/currency/currency.engine';


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

  // Upcoming subscription renewal reminders — daily 10:00 AM server time
  cron.schedule('0 10 * * *', async () => {
    try {
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      const startOfTargetDay = new Date(threeDaysLater);
      startOfTargetDay.setHours(0, 0, 0, 0);
      const endOfTargetDay = new Date(threeDaysLater);
      endOfTargetDay.setHours(23, 59, 59, 999);

      const renewingSoon = await Subscription.findAll({
        where: {
          status: 'active',
          isLifetime: false,
          currentPeriodEnd: { [Op.between]: [startOfTargetDay, endOfTargetDay] },
        },
      });

      for (const sub of renewingSoon) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const existingAlert = await Notification.findOne({
          where: {
            userId: sub.userId,
            type: 'subscription_renewal',
            sentAt: { [Op.gte]: todayStart },
          },
        });

        if (!existingAlert) {
          const renewDateStr = sub.currentPeriodEnd
            ? new Date(sub.currentPeriodEnd).toLocaleDateString()
            : 'soon';
          await createNotification(
            sub.userId,
            'subscription_renewal',
            'Subscription renewal upcoming',
            `Your BudgetBrain ${sub.plan} plan will renew on ${renewDateStr}.`,
            { subscriptionId: sub.id, plan: sub.plan, renewsAt: sub.currentPeriodEnd },
            true
          );
        }
      }
    } catch (err) {
      console.error('[cron] subscription_renewal failed:', err);
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

  // Recurring pattern detection — daily 2:00 AM server time
  cron.schedule('0 2 * * *', async () => {
    try {
      const count = await detectRecurringPatternsForAllUsers();
      console.log(`[cron] recurring detection completed: ${count} series detected`);
    } catch (err) {
      console.error('[cron] recurring_detection failed:', err);
    }
  });

  // Live exchange rate ingestion — daily 3:00 AM server time
  cron.schedule('0 3 * * *', async () => {
    try {
      const { updated, skipped } = await fetchAndUpsertLiveRates();
      console.log(`[cron] exchange_rate_sync completed: updated=${updated.join(',')} skipped=${skipped.join(',')}`);
    } catch (err) {
      console.error('[cron] exchange_rate_sync failed:', err);
    }
  });

  console.log('Scheduled jobs started');
}

