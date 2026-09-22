import { Op } from 'sequelize';
import { User, Transaction, Notification, Subscription } from '@database/models';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { getWeeklySpendComparison } from '@shared/modules/expenses/service/expenses.service';
import { sendBillDueReminders, processRecurringGoalContributions } from '@shared/modules/recurring/service/recurringSeries.service';
import { detectRecurringPatternsForAllUsers } from '@shared/modules/recurring/service/recurringDetection.service';
import { fetchAndUpsertLiveRates } from '@shared/currency/currency.engine';
import { sendMonthlyReportDigests } from '@shared/modules/reports/service/reportDigest.service';

export async function runDailyReminder(): Promise<void> {
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
}

export async function runSubscriptionRenewalReminders(): Promise<void> {
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
}

export async function runRecurringExpenseCheck(): Promise<void> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const batchSize = 500;
    const fetchBatch = (offset: number) =>
      Transaction.findAll({
        where: { isRecurring: true, type: 'expense' },
        limit: batchSize,
        offset,
        order: [['id', 'ASC']],
      });

    let offset = 0;
    let recurring = await fetchBatch(offset);

    while (recurring.length) {
      for (const tx of recurring) {
        const existing = await Notification.findOne({
          where: {
            userId: tx.userId,
            type: 'recurring_expense',
            sentAt: { [Op.gte]: todayStart },
          },
        });
        if (existing) continue;

        await createNotification(
          tx.userId,
          'recurring_expense',
          'Recurring expense due',
          `Don't forget: ${tx.merchant ?? 'Recurring expense'} — ₹${tx.amount}`,
          { transactionId: tx.id },
          true
        );
      }

      if (recurring.length < batchSize) break;
      offset += batchSize;
      recurring = await fetchBatch(offset);
    }
  } catch (err) {
    console.error('[cron] recurring_expense failed:', err);
  }
}

export async function runWeeklyDigest(): Promise<void> {
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
}

export async function runBillDueReminders(): Promise<void> {
  try {
    await sendBillDueReminders();
  } catch (err) {
    console.error('[cron] bill_due failed:', err);
  }
}

export async function runRecurringDetection(): Promise<void> {
  try {
    const count = await detectRecurringPatternsForAllUsers();
    console.log(`[cron] recurring detection completed: ${count} series detected`);
  } catch (err) {
    console.error('[cron] recurring_detection failed:', err);
  }
}

export async function runRecurringGoalContributions(): Promise<void> {
  try {
    await processRecurringGoalContributions();
  } catch (err) {
    console.error('[cron] recurring_goal_contribution failed:', err);
  }
}

export async function runMonthlyReportDigests(): Promise<void> {
  try {
    const { sent, failed } = await sendMonthlyReportDigests();
    console.log(`[cron] monthly_report_digest completed: sent=${sent} failed=${failed}`);
  } catch (err) {
    console.error('[cron] monthly_report_digest failed:', err);
  }
}

export async function runExchangeRateSync(): Promise<void> {
  try {
    const { updated, skipped } = await fetchAndUpsertLiveRates();
    console.log(`[cron] exchange_rate_sync completed: updated=${updated.join(',')} skipped=${skipped.join(',')}`);
  } catch (err) {
    console.error('[cron] exchange_rate_sync failed:', err);
  }
}
