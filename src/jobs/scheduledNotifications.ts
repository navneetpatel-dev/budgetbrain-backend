import { Op, QueryTypes } from 'sequelize';
import {
  User,
  Transaction,
  Notification,
  Subscription,
  VerificationToken,
  SsoHandoffToken,
  RefreshToken,
  sequelize,
} from '@database/models';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { getWeeklySpendComparison } from '@shared/modules/expenses/service/expenses.service';
import { sendBillDueReminders, processRecurringGoalContributions } from '@shared/modules/recurring/service/recurringSeries.service';
import { detectRecurringPatternsForAllUsers } from '@shared/modules/recurring/service/recurringDetection.service';
import { fetchAndUpsertLiveRates } from '@shared/currency/currency.engine';
import { sendMonthlyReportDigests } from '@shared/modules/reports/service/reportDigest.service';

export async function runDailyReminder(): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Single set-based query: find users who have NO transactions logged today
    // and have NOT received a daily_reminder notification today.
    const eligibleUsers = await sequelize.query<{ id: string }>(
      `SELECT u.id
       FROM users u
       WHERE u.is_suspended = false
         AND NOT EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.user_id = u.id AND t.created_at >= :today
         )
         AND NOT EXISTS (
           SELECT 1 FROM notifications n
           WHERE n.user_id = u.id AND n.type = 'daily_reminder' AND n.sent_at >= :today
         )`,
      {
        replacements: { today },
        type: QueryTypes.SELECT,
      }
    );

    for (const user of eligibleUsers) {
      await createNotification(
        user.id,
        'daily_reminder',
        'Log your expenses',
        "Take a moment to record today's spending and stay on track.",
        undefined,
        true
      );
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

    let lastId: string | undefined = undefined;

    let hasMore = true;
    while (hasMore) {
      const recurring: Transaction[] = await Transaction.findAll({
        where: {
          isRecurring: true,
          type: 'expense',
          ...(lastId ? { id: { [Op.gt]: lastId } } : {}),
        },
        limit: batchSize,
        order: [['id', 'ASC']],
      });

      if (!recurring.length) {
        hasMore = false;
        break;
      }

      const userIds = Array.from(new Set(recurring.map((t) => t.userId)));
      const existingAlerts = await Notification.findAll({
        where: {
          userId: { [Op.in]: userIds },
          type: 'recurring_expense',
          sentAt: { [Op.gte]: todayStart },
        },
        attributes: ['userId'],
      });
      const alreadyNotifiedUsers = new Set(existingAlerts.map((n) => n.userId));

      for (const tx of recurring) {
        if (alreadyNotifiedUsers.has(tx.userId)) continue;

        const currencySymbol = tx.currency ?? '₹';
        await createNotification(
          tx.userId,
          'recurring_expense',
          'Recurring expense due',
          `Don't forget: ${tx.merchant ?? 'Recurring expense'} — ${currencySymbol} ${tx.amount}`,
          { transactionId: tx.id },
          true
        );
        alreadyNotifiedUsers.add(tx.userId);
      }

      if (recurring.length < batchSize) break;
      lastId = recurring[recurring.length - 1].id;
    }
  } catch (err) {
    console.error('[cron] recurring_expense failed:', err);
  }
}

export async function runWeeklyDigest(): Promise<void> {
  try {
    const users = await User.findAll({ where: { weeklyDigestOptIn: true }, attributes: ['id', 'currency'] });
    for (const user of users) {
      const { thisWeek, lastWeek } = await getWeeklySpendComparison(user.id);
      const changeText =
        lastWeek > 0
          ? `${thisWeek >= lastWeek ? 'up' : 'down'} ${Math.round(
              (Math.abs(thisWeek - lastWeek) / lastWeek) * 100
            )}% vs last week`
          : 'no spending logged last week';

      const currency = user.currency ?? '₹';
      await createNotification(
        user.id,
        'weekly_digest',
        'Your weekly spending recap',
        `You spent ${currency} ${thisWeek.toFixed(2)} this week (${changeText}).`,
        { thisWeek, lastWeek }
      );
    }
  } catch (err) {
    console.error('[cron] weekly_digest failed:', err);
  }
}

export async function runTokenAndReportCleanup(): Promise<void> {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [deletedVerifications, deletedSso, deletedRefresh] = await Promise.all([
      VerificationToken.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: now } },
            { usedAt: { [Op.ne]: null, [Op.lt]: thirtyDaysAgo } },
          ],
        },
      }),
      SsoHandoffToken.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: now } },
            { usedAt: { [Op.ne]: null } },
          ],
        },
      }),
      RefreshToken.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: thirtyDaysAgo } },
            { revokedAt: { [Op.ne]: null, [Op.lt]: thirtyDaysAgo } },
          ],
        },
      }),
    ]);

    console.log(
      `[cron] token cleanup completed: verifications=${deletedVerifications}, sso=${deletedSso}, refresh=${deletedRefresh}`
    );
  } catch (err) {
    console.error('[cron] token cleanup failed:', err);
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
