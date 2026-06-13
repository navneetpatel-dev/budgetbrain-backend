import { Op, fn, col, literal } from 'sequelize';
import {
  Transaction,
  TransactionAttributes,
  Category,
  Budget,
  Goal,
  IncomeSource,
  User,
} from '../models';
import { AppError } from '../utils/errors';
import { checkBudgetAlertsAfterExpense } from './budgetAlertService';

const FREE_BUDGET_LIMIT = 3;
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

export async function getDashboard(userId: string) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  const cutoff = getHistoryCutoff(user.role);
  const dateFilter = cutoff ? { date: { [Op.gte]: cutoff } } : {};

  const [incomeResult, expenseResult, recentTransactions, budgets, goals] = await Promise.all([
    Transaction.findOne({
      where: { userId, type: 'income', ...dateFilter },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
    Transaction.findOne({
      where: { userId, type: 'expense', ...dateFilter },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
    Transaction.findAll({
      where: { userId, ...dateFilter },
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
      order: [['date', 'DESC'], ['createdAt', 'DESC']],
      limit: 10,
    }),
    Budget.findAll({
      where: { userId },
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
      limit: 5,
    }),
    Goal.findAll({ where: { userId }, limit: 5 }),
  ]);

  const totalIncome = Number((incomeResult as unknown as { total: string })?.total ?? 0);
  const totalExpenses = Number((expenseResult as unknown as { total: string })?.total ?? 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const categoryBreakdown = await Transaction.findAll({
    where: { userId, type: 'expense', ...dateFilter },
    attributes: [
      'categoryId',
      [fn('SUM', col('amount')), 'total'],
    ],
    include: [{ model: Category, as: 'category', attributes: ['name', 'icon', 'color'] }],
    group: ['categoryId', 'category.id', 'category.name', 'category.icon', 'category.color'],
    raw: true,
  });

  return {
    summary: {
      totalIncome,
      totalExpenses,
      netSavings,
      savingsRate: Math.round(savingsRate * 100) / 100,
      currency: user.currency,
    },
    recentTransactions,
    budgets,
    goals,
    categoryBreakdown,
  };
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

  return Transaction.findByPk(transaction.id, {
    include: [{ model: Category, as: 'category' }],
  });
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

export async function listCategories(userId: string) {
  return Category.findAll({
    where: { userId, isArchived: false },
    order: [['sortOrder', 'ASC']],
  });
}

export async function createCategory(
  userId: string,
  data: { name: string; icon?: string; color?: string }
) {
  const count = await Category.count({ where: { userId, isArchived: false } });
  const user = await User.findByPk(userId);
  if (user?.role === 'free' && count >= 20) {
    throw new AppError(403, 'Category limit reached for free plan', 'LIMIT_REACHED');
  }

  return Category.create({
    userId,
    name: data.name,
    icon: data.icon ?? null,
    color: data.color ?? null,
    sortOrder: count,
  });
}

export async function createBudget(
  userId: string,
  data: {
    name: string;
    type: 'monthly' | 'weekly' | 'category';
    amount: number;
    currency?: string;
    categoryId?: string;
    startDate: string;
    endDate?: string;
    alertThreshold?: number;
  }
) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  if (user.role === 'free') {
    const count = await Budget.count({ where: { userId } });
    if (count >= FREE_BUDGET_LIMIT) {
      throw new AppError(403, 'Free plan limited to 3 budgets', 'LIMIT_REACHED');
    }
  }

  return Budget.create({
    userId,
    name: data.name,
    type: data.type,
    amount: data.amount,
    currency: data.currency ?? user.currency,
    categoryId: data.categoryId ?? null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    alertThreshold: data.alertThreshold ?? 80,
  });
}

export async function listBudgets(userId: string) {
  return Budget.findAll({
    where: { userId },
    include: [{ model: Category, as: 'category' }],
    order: [['createdAt', 'DESC']],
  });
}

export async function createGoal(
  userId: string,
  data: {
    name: string;
    type: string;
    targetAmount: number;
    currency?: string;
    targetDate?: string;
  }
) {
  const user = await User.findByPk(userId);
  return Goal.create({
    userId,
    name: data.name,
    type: data.type as Goal['type'],
    targetAmount: data.targetAmount,
    currency: data.currency ?? user?.currency ?? 'INR',
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
  });
}

export async function listGoals(userId: string) {
  return Goal.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
}

export async function updateOnboarding(
  userId: string,
  data: {
    name?: string;
    country?: string;
    currency?: string;
    financialGoals?: string[];
    salaryRange?: string;
    monthlySavingsTarget?: number;
  }
) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  await user.update({ ...data, onboardingCompleted: true });
  return user;
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

export async function generateCsvReport(userId: string, startDate?: string, endDate?: string) {
  const where: Record<string, unknown> = { userId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>)[Op.gte as unknown as string] = startDate;
    if (endDate) (where.date as Record<string, unknown>)[Op.lte as unknown as string] = endDate;
  }

  const transactions = await Transaction.findAll({
    where,
    include: [{ model: Category, as: 'category' }],
    order: [['date', 'ASC']],
  });

  const header = 'Date,Type,Amount,Currency,Category,Merchant,Notes,Payment Method\n';
  const rows = transactions
    .map((t) => {
      const cat = (t as Transaction & { category?: Category }).category?.name ?? '';
      return [
        t.date,
        t.type,
        t.amount,
        t.currency,
        `"${cat}"`,
        `"${t.merchant ?? ''}"`,
        `"${(t.notes ?? '').replace(/"/g, '""')}"`,
        t.paymentMethod ?? '',
      ].join(',');
    })
    .join('\n');

  return header + rows;
}
