import { Op, fn, col } from 'sequelize';
import {
  Transaction,
  TransactionAttributes,
  Category,
  IncomeSource,
  User,
} from '../../models';
import { AppError } from '../../utils/errors';
import { checkBudgetAlertsAfterExpense } from '../budgets/budgetAlert.service';
import { logAuditEvent } from '../shared/audit.service';

const FREE_HISTORY_MONTHS = 3;

function getHistoryCutoff(role: string): Date | null {
  if (['premium', 'lifetime', 'admin'].includes(role)) return null;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - FREE_HISTORY_MONTHS);
  return cutoff;
}

function buildSearchVector(data: {
  notes?: string | null;
  merchant?: string | null;
  amount?: number;
}): string {
  return [data.notes, data.merchant, data.amount?.toString()].filter(Boolean).join(' ');
}

function buildDateFilter(user: User) {
  const cutoff = getHistoryCutoff(user.role);
  return cutoff ? { date: { [Op.gte]: cutoff } } : {};
}

export async function getTotalIncome(userId: string, user: User): Promise<number> {
  const result = await Transaction.findOne({
    where: { userId, type: 'income', ...buildDateFilter(user) },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

export async function getTotalExpenses(userId: string, user: User): Promise<number> {
  const result = await Transaction.findOne({
    where: { userId, type: 'expense', ...buildDateFilter(user) },
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

export async function getRecentTransactions(userId: string, user: User, limit: number) {
  return Transaction.findAll({
    where: { userId, ...buildDateFilter(user) },
    include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
    order: [['date', 'DESC'], ['createdAt', 'DESC']],
    limit,
  });
}

export async function getCategoryBreakdown(userId: string, user: User) {
  return Transaction.findAll({
    where: { userId, type: 'expense', ...buildDateFilter(user) },
    attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
    include: [{ model: Category, as: 'category', attributes: ['name', 'icon', 'color'] }],
    group: ['categoryId', 'category.id', 'category.name', 'category.icon', 'category.color'],
    raw: true,
  });
}

export async function listTransactions(
  userId: string,
  filters: {
    type?: 'expense' | 'income';
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
) {
  const user = await User.findByPk(userId);
  const cutoff = user ? getHistoryCutoff(user.role) : null;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { userId };
  if (filters.type) where.type = filters.type;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  if (filters.startDate || filters.endDate || cutoff) {
    where.date = {};
    if (filters.startDate) (where.date as Record<string, unknown>)[Op.gte as unknown as string] = filters.startDate;
    if (filters.endDate) (where.date as Record<string, unknown>)[Op.lte as unknown as string] = filters.endDate;
    if (cutoff) {
      const existing = (where.date as Record<string, unknown>)[Op.gte as unknown as string];
      (where.date as Record<string, unknown>)[Op.gte as unknown as string] =
        existing && new Date(existing as string) > cutoff ? existing : cutoff;
    }
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
  data: {
    type: 'expense' | 'income';
    amount: number;
    currency?: string;
    categoryId?: string;
    incomeSourceId?: string;
    notes?: string;
    merchant?: string;
    date: string;
    paymentMethod?: string;
    isRecurring?: boolean;
    recurringRule?: string;
  }
) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  const transaction = await Transaction.create({
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
    searchVector: buildSearchVector(data),
  });

  if (data.type === 'expense') {
    await checkBudgetAlertsAfterExpense(userId, data.categoryId);
  }

  const result = await Transaction.findByPk(transaction.id, {
    include: [{ model: Category, as: 'category' }],
  });

  await logAuditEvent(userId, 'create', 'transaction', result?.id);
  return result;
}

export async function updateTransaction(
  userId: string,
  id: string,
  data: Partial<{
    amount: number;
    categoryId: string;
    notes: string;
    merchant: string;
    date: string;
    paymentMethod: Transaction['paymentMethod'];
    incomeSourceId: string;
  }>
) {
  const transaction = await Transaction.findOne({ where: { id, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');

  const updateData: Partial<TransactionAttributes> = {};
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.merchant !== undefined) updateData.merchant = data.merchant;
  if (data.paymentMethod !== undefined) updateData.paymentMethod = data.paymentMethod;
  if (data.incomeSourceId !== undefined) updateData.incomeSourceId = data.incomeSourceId;
  if (data.date) updateData.date = new Date(data.date);

  await transaction.update({
    ...updateData,
    searchVector: buildSearchVector({ ...transaction.toJSON(), ...data }),
  });

  return transaction;
}

export async function deleteTransaction(userId: string, id: string) {
  const transaction = await Transaction.findOne({ where: { id, userId } });
  if (!transaction) throw new AppError(404, 'Transaction not found');
  await transaction.destroy();
}

export async function duplicateTransaction(userId: string, id: string) {
  const original = await Transaction.findOne({ where: { id, userId } });
  if (!original) throw new AppError(404, 'Transaction not found');

  const { id: _id, createdAt, updatedAt, ...data } = original.toJSON();
  return Transaction.create({ ...data, date: new Date() });
}

export async function globalSearch(userId: string, query: string) {
  const pattern = `%${query}%`;
  const [transactions, categories] = await Promise.all([
    Transaction.findAll({
      where: {
        userId,
        [Op.or]: [
          { searchVector: { [Op.iLike]: pattern } },
          { merchant: { [Op.iLike]: pattern } },
          { notes: { [Op.iLike]: pattern } },
        ],
      },
      include: [{ model: Category, as: 'category' }],
      limit: 20,
    }),
    Category.findAll({
      where: { userId, name: { [Op.iLike]: pattern }, isArchived: false },
      limit: 10,
    }),
  ]);

  return { transactions, categories };
}
