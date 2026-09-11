import { Op, fn, col, QueryTypes, Transaction as DbTransaction } from 'sequelize';
import {
  Transaction,
  TransactionAttributes,
  TransactionAttachment,
  Category,
  IncomeSource,
  User,
  sequelize,
} from '../../../../shared/models';
import { AppError } from '../../../shared/utils/errors';
import { checkBudgetAlertsAfterExpense } from '../../budgets/service/budgetAlert.service';
import { upsertMerchantCategoryRule } from '../../categories/service/merchantMemory.service';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import { resolvePagination, paginatedResult } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../types';

function buildSearchVector(data: {
  notes?: string | null;
  merchant?: string | null;
  amount?: number;
}): string {
  return [data.notes, data.merchant, data.amount?.toString()].filter(Boolean).join(' ');
}

export async function getTotalIncome(userId: string, _user: User): Promise<number> {
  const result = await Transaction.findOne({
    where: { userId, type: 'income' },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

export async function getTotalExpenses(userId: string, _user: User): Promise<number> {
  const result = await Transaction.findOne({
    where: { userId, type: 'expense' },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

export async function getRecentTransactions(userId: string, _user: User, limit: number) {
  return Transaction.findAll({
    where: { userId },
    include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit,
  });
}

export async function getCategoryBreakdown(userId: string, _user: User, limit = 2) {
  return Transaction.findAll({
    where: { userId, type: 'expense' },
    attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
    include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
    group: ['category_id', 'category.id', 'category.name', 'category.icon', 'category.color'],
    order: [[fn('SUM', col('amount')), 'DESC']],
    limit,
    subQuery: false,
  });
}

export async function listTransactions(
  userId: string,
  filters: {
    type?: 'expense' | 'income';
    categoryId?: string;
    incomeSourceId?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    tag?: string;
    page?: number;
    limit?: number;
  }
) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);

  const where: Record<string, unknown> = { userId };
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.incomeSourceId) where.incomeSourceId = filters.incomeSourceId;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.tag) where.tags = { [Op.contains]: [filters.tag] };

  if (filters.startDate || filters.endDate) {
    where.date = {};
    if (filters.startDate) (where.date as Record<string, unknown>)[Op.gte as unknown as string] = filters.startDate;
    if (filters.endDate) (where.date as Record<string, unknown>)[Op.lte as unknown as string] = filters.endDate;
  }

  if (filters.search) {
    where.searchVector = { [Op.iLike]: `%${filters.search}%` };
  }

  const { rows, count } = await Transaction.findAndCountAll({
    where,
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
      { model: IncomeSource, as: 'incomeSource', attributes: ['id', 'name', 'type'] },
    ],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit,
    offset,
  });

  return { transactions: rows, total: count, page, limit };
}

export async function createTransaction(
  userId: string,
  data: CreateTransactionInput,
  options?: { transaction?: DbTransaction }
) {
  const user = await User.findByPk(userId, options?.transaction ? { transaction: options.transaction } : undefined);
  if (!user) throw new AppError(404, 'User not found');

  const run = async (t: DbTransaction) => {
    const transaction = await Transaction.create(
      {
        userId,
        type: data.type,
        amount: data.amount,
        currency: data.currency ?? user.currency,
        categoryId: data.categoryId ?? null,
        incomeSourceId: data.incomeSourceId ?? null,
        notes: data.notes ?? null,
        merchant: data.merchant ?? null,
        date: new Date(data.date),
        paymentMethod: (data.paymentMethod as Transaction['paymentMethod']) ?? null,
        isRecurring: data.isRecurring ?? false,
        recurringRule: data.recurringRule ?? null,
        tags: data.tags ?? [],
        searchVector: buildSearchVector(data),
      },
      { transaction: t }
    );

    if (data.type === 'expense') {
      await checkBudgetAlertsAfterExpense(userId, data.categoryId, t);
    }

    if (data.type === 'expense' && data.categoryId && data.merchant) {
      await upsertMerchantCategoryRule(userId, data.merchant, data.categoryId, t);
    }

    const result = await Transaction.findByPk(transaction.id, {
      include: [{ model: Category, as: 'category' }],
      transaction: t,
    });

    await writeAuditLog({
      action: AuditAction.TRANSACTION_CREATE,
      resource: AuditResource.TRANSACTION,
      resourceId: result?.id,
      actorUserId: userId,
      afterState: {
        type: data.type,
        amount: data.amount,
        categoryId: data.categoryId ?? null,
        merchant: data.merchant ?? null,
      },
      transaction: t,
    });

    return result;
  };

  if (options?.transaction) {
    return run(options.transaction);
  }
  return sequelize.transaction(run);
}

export async function updateTransaction(
  userId: string,
  id: string,
  data: UpdateTransactionInput
) {
  return sequelize.transaction(async (t) => {
    const transaction = await Transaction.findOne({
      where: { id, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!transaction) throw new AppError(404, 'Transaction not found');

    const beforeState = {
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      notes: transaction.notes,
      merchant: transaction.merchant,
      paymentMethod: transaction.paymentMethod,
      incomeSourceId: transaction.incomeSourceId,
      date: transaction.date,
    };

    const updateData: Partial<TransactionAttributes> = {};
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.merchant !== undefined) updateData.merchant = data.merchant;
    if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
    if (data.incomeSourceId !== undefined) updateData.incomeSourceId = data.incomeSourceId;
    if (data.date) updateData.date = new Date(data.date);
    if (data.tags !== undefined) updateData.tags = data.tags;

    await transaction.update(
      {
        ...updateData,
        searchVector: buildSearchVector({ ...transaction.toJSON(), ...data }),
      },
      { transaction: t }
    );

    const effectiveCategoryId = data.categoryId ?? transaction.categoryId;
    const effectiveMerchant = data.merchant ?? transaction.merchant;
    if (transaction.type === 'expense' && effectiveCategoryId && effectiveMerchant) {
      await upsertMerchantCategoryRule(userId, effectiveMerchant, effectiveCategoryId, t);
    }

    await writeAuditLog({
      action: AuditAction.TRANSACTION_UPDATE,
      resource: AuditResource.TRANSACTION,
      resourceId: id,
      actorUserId: userId,
      beforeState,
      afterState: { ...beforeState, ...updateData },
      transaction: t,
    });

    return transaction;
  });
}

export async function deleteTransaction(userId: string, id: string) {
  await sequelize.transaction(async (t) => {
    const transaction = await Transaction.findOne({
      where: { id, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!transaction) throw new AppError(404, 'Transaction not found');

    const beforeState = {
      type: transaction.type,
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      merchant: transaction.merchant,
    };

    await TransactionAttachment.destroy({ where: { transactionId: id }, transaction: t });
    await transaction.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.TRANSACTION_DELETE,
      resource: AuditResource.TRANSACTION,
      resourceId: id,
      actorUserId: userId,
      beforeState,
      severity: 'warning',
      transaction: t,
    });
  });
}

export async function duplicateTransaction(userId: string, id: string) {
  const original = await Transaction.findOne({ where: { id, userId } });
  if (!original) throw new AppError(404, 'Transaction not found');

  const { id: _id, createdAt, updatedAt, ...data } = original.toJSON();
  return Transaction.create({ ...data, date: new Date() });
}

export async function getTransaction(userId: string, id: string) {
  const transaction = await Transaction.findOne({
    where: { id, userId },
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
      { model: IncomeSource, as: 'incomeSource', attributes: ['id', 'name', 'type'] },
    ],
  });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  return transaction;
}

export async function globalSearch(userId: string, query: string, filters: PaginationInput = {}) {
  const pattern = `%${query}%`;
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 20);

  const matchingCategories = await Category.findAll({
    where: { userId, name: { [Op.iLike]: pattern }, isArchived: false },
    attributes: ['id'],
    limit: 10,
  });
  const categoryIds = matchingCategories.map((c) => c.id);

  const orConditions: Record<string, unknown>[] = [
    { searchVector: { [Op.iLike]: pattern } },
    { merchant: { [Op.iLike]: pattern } },
    { notes: { [Op.iLike]: pattern } },
  ];
  if (categoryIds.length > 0) {
    orConditions.push({ categoryId: { [Op.in]: categoryIds } });
  }

  const { rows, count } = await Transaction.findAndCountAll({
    where: { userId, [Op.or]: orConditions },
    include: [{ model: Category, as: 'category' }],
    order: [['date', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return paginatedResult('transactions', rows, count, page, limit);
}

/** Distinct tags the user has used before, for autocomplete. */
export async function getTagSuggestions(userId: string, limit = 20): Promise<string[]> {
  const rows = await sequelize.query<{ tag: string }>(
    `SELECT DISTINCT unnest(tags) AS tag
     FROM transactions
     WHERE user_id = :userId AND tags IS NOT NULL
     ORDER BY tag ASC
     LIMIT :limit`,
    { replacements: { userId, limit }, type: QueryTypes.SELECT }
  );
  return rows.map((r) => r.tag);
}

/**
 * Consecutive days (ending yesterday) with zero expense transactions, capped at 90 days lookback.
 * Today is excluded since it isn't over yet.
 */
export async function getNoSpendStreak(userId: string, maxLookbackDays = 90): Promise<number> {
  const spendDays = await Transaction.findAll({
    where: {
      userId,
      type: 'expense',
      date: { [Op.gte]: shiftDaysIso(todayIso(), -maxLookbackDays) },
    },
    attributes: [[fn('DISTINCT', col('date')), 'date']],
    raw: true,
  });
  const spentOn = new Set(spendDays.map((r) => String((r as unknown as { date: string }).date)));

  let streak = 0;
  for (let i = 1; i <= maxLookbackDays; i += 1) {
    const day = shiftDaysIso(todayIso(), -i);
    if (spentOn.has(day)) break;
    streak += 1;
  }
  return streak;
}

/** This-week vs last-week expense totals (Sun–Sat), for the weekly digest notification. */
export async function getWeeklySpendComparison(
  userId: string
): Promise<{ thisWeek: number; lastWeek: number }> {
  const now = new Date();
  const day = now.getDay();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - day);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const [thisWeek, lastWeek] = await Promise.all([
    sumExpensesBetween(userId, iso(thisWeekStart), iso(now)),
    sumExpensesBetween(userId, iso(lastWeekStart), iso(lastWeekEnd)),
  ]);

  return { thisWeek, lastWeek };
}

async function sumExpensesBetween(userId: string, startDate: string, endDate: string): Promise<number> {
  const result = await Transaction.findOne({
    where: { userId, type: 'expense', date: { [Op.gte]: startDate, [Op.lte]: endDate } },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
