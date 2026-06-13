import { Op, fn, col } from 'sequelize';
import { Budget, BudgetAlert, Transaction } from '../models';
import { createNotification } from './notificationService';

export async function checkBudgetAlertsAfterExpense(
  userId: string,
  categoryId?: string | null
): Promise<void> {
  const budgets = await Budget.findAll({
    where: {
      userId,
      ...(categoryId
        ? { [Op.or]: [{ categoryId }, { categoryId: null, type: 'monthly' }] }
        : {}),
    },
  });

  for (const budget of budgets) {
    if (budget.categoryId && categoryId && budget.categoryId !== categoryId) {
      continue;
    }

    const dateFilter: Record<string, unknown> = {
      [Op.gte as unknown as string]: budget.startDate,
    };
    if (budget.endDate) {
      dateFilter[Op.lte as unknown as string] = budget.endDate;
    }

    const spentResult = await Transaction.findOne({
      where: {
        userId,
        type: 'expense',
        date: dateFilter,
        ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
      },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    });

    const spent = Number((spentResult as unknown as { total: string })?.total ?? 0);
    const budgetAmount = Number(budget.amount);
    if (budgetAmount <= 0) continue;

    const percentUsed = (spent / budgetAmount) * 100;
    const threshold = budget.alertThreshold;

    if (percentUsed < threshold) continue;

    const existingAlert = await BudgetAlert.findOne({
      where: {
        budgetId: budget.id,
        userId,
        threshold,
        triggeredAt: { [Op.gte]: budget.startDate },
      },
    });

    if (existingAlert) continue;

    await BudgetAlert.create({
      budgetId: budget.id,
      userId,
      threshold,
      triggeredAt: new Date(),
    });

    const exceeded = percentUsed >= 100;
    await createNotification(
      userId,
      'budget_exceeded',
      exceeded ? 'Budget exceeded' : 'Budget alert',
      exceeded
        ? `You've exceeded your "${budget.name}" budget (${Math.round(percentUsed)}% used).`
        : `You've used ${Math.round(percentUsed)}% of your "${budget.name}" budget.`,
      { budgetId: budget.id, percentUsed: Math.round(percentUsed) }
    );
  }
}
