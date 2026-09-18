import { Op, fn, col } from 'sequelize';
import { Budget, BudgetAlert, Category, Transaction, User, sequelize } from '@database/models';
import { getBudgetDateRange, getPreviousBudgetDateRange } from '@shared/budgets/budgetPeriod';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type { BudgetWithSpent, CreateBudgetInput, UpdateBudgetInput } from '../types';

async function sumExpensesInRange(
  userId: string,
  categoryId: string | null,
  startDate: string,
  endDate: string
): Promise<number> {
  const where: Record<string, unknown> = {
    userId,
    type: 'expense',
    date: { [Op.gte]: startDate, [Op.lte]: endDate },
  };
  if (categoryId) {
    where.categoryId = categoryId;
  }

  const result = await Transaction.findOne({
    where,
    attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
    raw: true,
  });
  return Number((result as unknown as { total: string })?.total ?? 0);
}

async function computeBudgetSpent(userId: string, budget: Budget): Promise<number> {
  const { startDate, endDate } = getBudgetDateRange(budget);
  return sumExpensesInRange(userId, budget.categoryId, startDate, endDate);
}

/**
 * Single-period rollover: leftover (or deficit) from the immediately preceding period,
 * measured against the budget's nominal amount (not compounded across multiple periods).
 * Not supported for `custom` budgets, which have a fixed one-off date range.
 */
async function computeRolloverAmount(userId: string, budget: Budget): Promise<number> {
  if (!budget.rollover || budget.type === 'custom') return 0;
  const { startDate, endDate } = getPreviousBudgetDateRange(budget);
  const previousSpent = await sumExpensesInRange(userId, budget.categoryId, startDate, endDate);
  return Number(budget.amount) - previousSpent;
}

/** Mirrors Goal.progressPercentage's capping formula (database/models/goal.model.ts). */
function computeSpentPercentage(spent: number, effectiveAmount: number): number {
  if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) return 0;
  return Math.min(100, Math.round((spent / effectiveAmount) * 100));
}

async function enrichBudgetsWithSpent(budgets: Budget[]): Promise<BudgetWithSpent[]> {
  return Promise.all(
    budgets.map(async (budget) => {
      const [spent, rolloverAmount] = await Promise.all([
        computeBudgetSpent(budget.userId, budget),
        computeRolloverAmount(budget.userId, budget),
      ]);
      const effectiveAmount = Number(budget.amount) + rolloverAmount;
      return {
        ...budget.toJSON(),
        spent,
        rolloverAmount,
        effectiveAmount,
        spentPercentage: computeSpentPercentage(spent, effectiveAmount),
      } as BudgetWithSpent;
    })
  );
}

export async function createBudget(userId: string, data: CreateBudgetInput) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  const budget = await Budget.create({
    userId,
    name: data.name,
    type: data.type,
    amount: data.amount,
    currency: data.currency ?? user.currency,
    categoryId: data.categoryId ?? null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    alertThreshold: data.alertThreshold ?? 80,
    rollover: data.rollover ?? false,
  });

  await writeAuditLog({
    action: AuditAction.BUDGET_CREATE,
    resource: AuditResource.BUDGET,
    resourceId: budget.id,
    actorUserId: userId,
    afterState: { name: budget.name, amount: budget.amount, type: budget.type },
  });

  return budget;
}

export async function getBudget(userId: string, id: string): Promise<BudgetWithSpent> {
  const budget = await Budget.findOne({
    where: { id, userId },
    include: [{ model: Category, as: 'category' }],
  });
  if (!budget) throw new AppError(404, 'Budget not found');
  const [spent, rolloverAmount] = await Promise.all([
    computeBudgetSpent(userId, budget),
    computeRolloverAmount(userId, budget),
  ]);
  const effectiveAmount = Number(budget.amount) + rolloverAmount;
  return {
    ...budget.toJSON(),
    spent,
    rolloverAmount,
    effectiveAmount,
    spentPercentage: computeSpentPercentage(spent, effectiveAmount),
  } as BudgetWithSpent;
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

export async function updateBudget(userId: string, id: string, data: UpdateBudgetInput) {
  const budget = await Budget.findOne({ where: { id, userId } });
  if (!budget) throw new AppError(404, 'Budget not found');

  const beforeState = {
    name: budget.name,
    amount: budget.amount,
    alertThreshold: budget.alertThreshold,
    endDate: budget.endDate,
    rollover: budget.rollover,
  };

  await budget.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.alertThreshold !== undefined && { alertThreshold: data.alertThreshold }),
    ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
    ...(data.rollover !== undefined && { rollover: data.rollover }),
  });

  await writeAuditLog({
    action: AuditAction.BUDGET_UPDATE,
    resource: AuditResource.BUDGET,
    resourceId: id,
    actorUserId: userId,
    beforeState,
    afterState: {
      name: budget.name,
      amount: budget.amount,
      alertThreshold: budget.alertThreshold,
      endDate: budget.endDate,
      rollover: budget.rollover,
    },
  });

  return budget;
}

export async function deleteBudget(userId: string, id: string) {
  await sequelize.transaction(async (t) => {
    const budget = await Budget.findOne({
      where: { id, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!budget) throw new AppError(404, 'Budget not found');

    await BudgetAlert.destroy({ where: { budgetId: id }, transaction: t });
    await budget.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.BUDGET_DELETE,
      resource: AuditResource.BUDGET,
      resourceId: id,
      actorUserId: userId,
      beforeState: { name: budget.name, amount: budget.amount },
      severity: 'warning',
      transaction: t,
    });
  });
}
