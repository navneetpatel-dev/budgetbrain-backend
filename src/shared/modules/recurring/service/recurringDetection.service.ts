import { Op } from 'sequelize';
import { Transaction, RecurringSeries, User } from '@database/models';
import type { RecurringCadence } from '@database/models';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { shiftByCadenceDate } from '../shiftByCadence';

interface TransactionSummary {
  id: string;
  amount: number;
  date: Date;
  categoryId: string | null;
  currency: string;
}

function computeCadence(intervalDays: number): RecurringCadence | null {
  if (intervalDays >= 5 && intervalDays <= 9) return 'weekly';
  if (intervalDays >= 25 && intervalDays <= 35) return 'monthly';
  if (intervalDays >= 350 && intervalDays <= 380) return 'yearly';
  return null;
}

export async function detectRecurringPatternsForUser(userId: string): Promise<RecurringSeries[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const transactions = await Transaction.findAll({
    where: {
      userId,
      type: 'expense',
      merchant: { [Op.ne]: null },
      date: { [Op.gte]: ninetyDaysAgo },
    },
    attributes: ['id', 'merchant', 'amount', 'date', 'categoryId', 'currency', 'isRecurring'],
    order: [['date', 'ASC']],
  });

  const byMerchant = new Map<string, TransactionSummary[]>();
  for (const tx of transactions) {
    const merchant = tx.merchant!.trim();
    if (!merchant) continue;
    const existing = byMerchant.get(merchant) ?? [];
    existing.push({
      id: tx.id,
      amount: Number(tx.amount),
      date: new Date(tx.date),
      categoryId: tx.categoryId,
      currency: tx.currency,
    });
    byMerchant.set(merchant, existing);
  }

  const createdSeries: RecurringSeries[] = [];

  for (const [merchant, history] of byMerchant) {
    if (history.length < 2) continue;

    // Check consecutive intervals
    for (let i = 0; i < history.length - 1; i++) {
      const current = history[i];
      const next = history[i + 1];

      const diffTime = Math.abs(next.date.getTime() - current.date.getTime());
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      const cadence = computeCadence(diffDays);
      if (!cadence) continue;

      // Amount tolerance: within 10%
      const amountDiff = Math.abs(current.amount - next.amount);
      const isConsistentAmount = amountDiff / current.amount <= 0.1;

      if (isConsistentAmount) {
        // Check if recurring series already exists
        const existingSeries = await RecurringSeries.findOne({
          where: { userId, merchant },
        });

        if (!existingSeries) {
          const latest = history[history.length - 1];
          const nextDueDate = shiftByCadenceDate(latest.date, cadence);

          const series = await RecurringSeries.create({
            userId,
            merchant,
            categoryId: latest.categoryId,
            amount: latest.amount,
            currency: latest.currency,
            cadence,
            nextDueDate,
            lastChargedDate: latest.date,
            source: 'detected',
            active: true,
          });

          createdSeries.push(series);

          await writeAuditLog({
            action: AuditAction.RECURRING_SERIES_CREATE,
            resource: AuditResource.RECURRING_SERIES,
            resourceId: series.id,
            actorUserId: userId,
            afterState: {
              merchant,
              amount: latest.amount,
              cadence,
              source: 'detected',
            },
          });

          await createNotification(
            userId,
            'bill_due',
            'Recurring Bill Detected',
            `We detected a repeating ${cadence} charge for ${merchant} (₹${latest.amount.toFixed(2)}).`,
            { recurringSeriesId: series.id }
          );

          break; // Stop after creating for this merchant
        }
      }
    }
  }

  return createdSeries;
}

export async function detectRecurringPatternsForAllUsers(): Promise<number> {
  const users = await User.findAll({ attributes: ['id'] });
  let totalDetected = 0;

  for (const user of users) {
    try {
      const detected = await detectRecurringPatternsForUser(user.id);
      totalDetected += detected.length;
    } catch (err) {
      console.error(`[RecurringDetection] Error scanning user ${user.id}:`, err);
    }
  }

  return totalDetected;
}
