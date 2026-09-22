import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize, RecurringSeries, Transaction, Goal } from '@database/models';
import type { RecurringCadence } from '@database/models';
import { AppError } from '@shared/errors';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { contributeToGoal } from '@shared/modules/goals/goals.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type { CreateRecurringSeriesInput, UpdateRecurringSeriesInput } from '../recurring.types';
import { shiftByCadence, shiftDaysIso } from '../shiftByCadence';

export { shiftByCadence } from '../shiftByCadence';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** How far back to look for an `isRecurring`-flagged expense — bills/subscriptions/EMIs
 * repeat far more often than every 180 days, so anything older adds no detection signal
 * and would otherwise grow this query's cost forever as a user's history grows. */
const RECURRING_LOOKBACK_DAYS = 180;

/**
 * Lightweight heuristic: any merchant the user has marked `isRecurring` on at least one expense
 * gets (or updates) a `source: 'detected'` series, using the most recent occurrence's amount.
 * Cadence defaults to monthly (the common case for bills/subscriptions/EMIs); the user can
 * correct it after the fact since detected series remain editable.
 *
 * Runs on every `listRecurringSeries` call (immediate feedback when a user flags an expense
 * as recurring), so it must stay cheap: one bounded fetch + one batched existence check,
 * not a per-merchant query — see the recurring_series_user_merchant_unique index/constraint
 * this relies on for race-safety under concurrent requests.
 */
export async function detectRecurringSeries(userId: string): Promise<void> {
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - RECURRING_LOOKBACK_DAYS);

  const rows = await Transaction.findAll({
    where: {
      userId,
      type: 'expense',
      isRecurring: true,
      merchant: { [Op.ne]: null },
      date: { [Op.gte]: lookbackStart },
    },
    attributes: ['merchant', 'categoryId', 'amount', 'date'],
    order: [['date', 'DESC']],
    raw: true,
  });

  const latestByMerchant = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const merchant = (row as unknown as { merchant: string }).merchant;
    if (!latestByMerchant.has(merchant)) {
      latestByMerchant.set(merchant, row);
    }
  }
  if (latestByMerchant.size === 0) return;

  // One batched existence check instead of one findOne per merchant.
  const existing = (await RecurringSeries.findAll({
    where: { userId, merchant: { [Op.in]: [...latestByMerchant.keys()] } },
    attributes: ['merchant'],
    raw: true,
  })) as unknown as Array<{ merchant: string }>;
  const existingMerchants = new Set(existing.map((e) => e.merchant));

  for (const [merchant, row] of latestByMerchant) {
    if (existingMerchants.has(merchant)) continue; // don't clobber a series the user may have already edited

    const r = row as unknown as { categoryId: string | null; amount: string; date: string };
    try {
      // findOrCreate (not create): two concurrent requests for the same new merchant now
      // race safely against the unique (user_id, merchant) constraint instead of both
      // passing the findAll-based check above and double-inserting.
      await RecurringSeries.findOrCreate({
        where: { userId, merchant },
        defaults: {
          userId,
          merchant,
          categoryId: r.categoryId,
          amount: Number(r.amount),
          cadence: 'monthly',
          nextDueDate: new Date(shiftByCadence(String(r.date), 'monthly')),
          lastChargedDate: new Date(r.date),
          source: 'detected',
        },
      });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
    }
  }
}

export async function listRecurringSeries(userId: string, filters: PaginationInput = {}) {
  await detectRecurringSeries(userId);

  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await RecurringSeries.findAndCountAll({
    where: { userId, active: true },
    order: [['nextDueDate', 'ASC']],
    limit,
    offset,
  });
  return paginatedResult('recurringSeries', rows, count, page, limit);
}

export async function listUpcomingForDashboard(userId: string, maxItems = 3) {
  const { recurringSeries } = await listRecurringSeries(userId, { page: 1, limit: maxItems });
  return recurringSeries;
}

export async function createRecurringSeries(userId: string, data: CreateRecurringSeriesInput) {
  const series = await RecurringSeries.create({
    userId,
    merchant: data.merchant,
    categoryId: data.categoryId ?? null,
    amount: data.amount,
    currency: data.currency ?? 'INR',
    cadence: data.cadence as RecurringCadence,
    nextDueDate: new Date(data.nextDueDate),
    reminderDaysBefore: data.reminderDaysBefore ?? 3,
    source: 'manual',
    goalId: data.goalId ?? null,
  });

  await writeAuditLog({
    action: AuditAction.RECURRING_SERIES_CREATE,
    resource: AuditResource.RECURRING_SERIES,
    resourceId: series.id,
    actorUserId: userId,
    afterState: { merchant: series.merchant, amount: series.amount, cadence: series.cadence },
  });

  return series;
}

export async function updateRecurringSeries(
  userId: string,
  id: string,
  data: UpdateRecurringSeriesInput
) {
  const series = await RecurringSeries.findOne({ where: { id, userId } });
  if (!series) throw new AppError(404, 'Recurring series not found');

  const beforeState = { amount: series.amount, active: series.active, nextDueDate: series.nextDueDate };

  await series.update({
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
    ...(data.nextDueDate !== undefined && { nextDueDate: new Date(data.nextDueDate) }),
    ...(data.active !== undefined && { active: data.active }),
    ...(data.reminderDaysBefore !== undefined && { reminderDaysBefore: data.reminderDaysBefore }),
    ...(data.goalId !== undefined && { goalId: data.goalId }),
  });

  await writeAuditLog({
    action: AuditAction.RECURRING_SERIES_UPDATE,
    resource: AuditResource.RECURRING_SERIES,
    resourceId: id,
    actorUserId: userId,
    beforeState,
    afterState: { amount: series.amount, active: series.active, nextDueDate: series.nextDueDate },
  });

  return series;
}

export async function deleteRecurringSeries(userId: string, id: string) {
  const series = await RecurringSeries.findOne({ where: { id, userId } });
  if (!series) throw new AppError(404, 'Recurring series not found');

  await series.destroy();

  await writeAuditLog({
    action: AuditAction.RECURRING_SERIES_DELETE,
    resource: AuditResource.RECURRING_SERIES,
    resourceId: id,
    actorUserId: userId,
    beforeState: { merchant: series.merchant, amount: series.amount },
    severity: 'warning',
  });
}

/**
 * Cron entry point: reminds users of bills due within their `reminderDaysBefore` window,
 * then rolls `nextDueDate` forward once a due date has passed. One notification per due date
 * (guarded by `lastChargedDate` no longer being before the reminder window).
 */
export async function sendBillDueReminders(): Promise<void> {
  const today = todayIso();
  const series = await RecurringSeries.findAll({ where: { active: true } });

  for (const s of series) {
    const dueDate = String(s.nextDueDate).slice(0, 10);
    const reminderFrom = shiftDaysIso(dueDate, -s.reminderDaysBefore);
    const alreadyReminded = s.lastChargedDate && String(s.lastChargedDate).slice(0, 10) >= reminderFrom;

    if (today >= reminderFrom && today <= dueDate && !alreadyReminded) {
      await createNotification(
        s.userId,
        'bill_due',
        'Upcoming bill',
        `${s.merchant} — ₹${Number(s.amount).toFixed(2)} is due ${dueDate === today ? 'today' : `on ${dueDate}`}.`,
        {
          recurringSeriesId: s.id,
          merchant: s.merchant,
          categoryId: s.categoryId,
          amount: s.amount,
          currency: s.currency,
        }
      );
      await s.update({ lastChargedDate: new Date(today) });
    }

    if (today > dueDate) {
      await s.update({ nextDueDate: new Date(shiftByCadence(dueDate, s.cadence)) });
    }
  }
}

/**
 * Cron entry point: auto-contributes to a linked Goal for every active, due recurring series.
 * The contribution and the due-date advance happen in one transaction so a crash mid-way can't
 * cause a retry to double-contribute. If the linked Goal is already complete, the series is
 * deactivated (with a notification) instead of over-contributing.
 */
export async function processRecurringGoalContributions(): Promise<void> {
  const today = todayIso();
  const series = await RecurringSeries.findAll({
    where: { active: true, goalId: { [Op.ne]: null }, nextDueDate: { [Op.lte]: new Date(today) } },
  });

  for (const s of series) {
    await sequelize.transaction(async (t) => {
      const goal = s.goalId ? await Goal.findByPk(s.goalId, { transaction: t }) : null;

      if (!goal || goal.completedAt) {
        await s.update(
          { active: false, goalId: null },
          { transaction: t }
        );
        await createNotification(
          s.userId,
          'recurring_expense',
          'Automatic goal contribution stopped',
          goal
            ? `"${goal.name}" is already complete, so the recurring contribution from ${s.merchant} has been turned off.`
            : `The goal linked to ${s.merchant}'s recurring contribution no longer exists, so it has been turned off.`,
          { recurringSeriesId: s.id, goalId: s.goalId }
        );
        return;
      }

      await contributeToGoal(
        s.userId,
        goal.id,
        Number(s.amount),
        'Automatic recurring contribution',
        t
      );

      await s.update(
        { nextDueDate: new Date(shiftByCadence(String(s.nextDueDate).slice(0, 10), s.cadence)) },
        { transaction: t }
      );
    });
  }
}
