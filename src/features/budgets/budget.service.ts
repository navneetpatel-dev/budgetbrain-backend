import { Op, fn, col } from 'sequelize';
import { Budget, Category, Transaction, User } from '../../models';
import { AppError } from '../../utils/errors';
import { paginatedResult, resolvePagination, type PaginationInput } from '../../shared/pagination';

const FREE_BUDGET_LIMIT = 3;

export type BudgetWithSpent = ReturnType<Budget['toJSON']> & {
  category?: Category | null;
  spent: number;
};

function getBudgetDateRange(budget: Budget): { startDate: string; endDate: string } {
  const now = new Date();
  if (budget.type === 'weekly') {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: budget.startDate.toISOString().split('T')[0] ?? start.toISOString().split('T')[0],
    endDate: budget.endDate?.toISOString().split('T')[0] ?? end.toISOString().split('T')[0],
  };
}

async function computeBudgetSpent(userId: string, budget: Budget): Promise<number> {
  const { startDate, endDate } = getBudgetDateRange(budget);
  const where: Record<string, unknown> = {
    userId,
    type: 'expense',
    date: { [Op.gte]: startDate, [Op.lte]: endDate },
  };
  if (budget.type === 'category' && budget.categoryId) {
    where.categoryId = budget.categoryId;
  }

  const result = await Transaction.findOne({
    where,
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

async function enrichBudgetsWithSpent(budgets: Budget[]): Promise<BudgetWithSpent[]> {
  return Promise.all(
    budgets.map(async (budget) => {
      const spent = await computeBudgetSpent(budget.userId, budget);
      return { ...budget.toJSON(), spent } as BudgetWithSpent;
    })
  );
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

export async function getBudget(userId: string, id: string): Promise<BudgetWithSpent> {
  const budget = await Budget.findOne({
    where: { id, userId },
    include: [{ model: Category, as: 'category' }],
  });
  if (!budget) throw new AppError(404, 'Budget not found');
  const spent = await computeBudgetSpent(userId, budget);
  return { ...budget.toJSON(), spent } as BudgetWithSpent;
}

export async function listBudgets(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await Budget.findAndCountAll({
    where: { userId },
    include: [{ model: Category, as: 'category' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  const budgets = await enrichBudgetsWithSpent(rows);
  return paginatedResult('budgets', budgets, count, page, limit);
}

export async function listBudgetsForDashboard(userId: string, maxItems = 5) {
  const { budgets } = await listBudgets(userId, { page: 1, limit: maxItems });
  return budgets;
}

export async function updateBudget(
  userId: string,
  id: string,
  data: {
    name?: string;
    amount?: number;
    alertThreshold?: number;
    endDate?: string;
  }
) {
  const budget = await Budget.findOne({ where: { id, userId } });
  if (!budget) throw new AppError(404, 'Budget not found');

  await budget.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.alertThreshold !== undefined && { alertThreshold: data.alertThreshold }),
    ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
  });

  return budget;
}

export async function deleteBudget(userId: string, id: string) {
  const budget = await Budget.findOne({ where: { id, userId } });
  if (!budget) throw new AppError(404, 'Budget not found');
  await budget.destroy();
}
