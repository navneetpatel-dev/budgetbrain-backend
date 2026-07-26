import { Op, fn, col, Transaction as DbTransaction } from 'sequelize';
import { Budget, BudgetAlert, Transaction } from '../../../../shared/models';
import { getBudgetDateRange } from '../../../../shared/budgets/budgetPeriod';
import { createNotification } from '../../notifications/service/notification.service';

export async function checkBudgetAlertsAfterExpense(
  userId: string,
  categoryId?: string | null,
  dbTx?: DbTransaction
): Promise<void> {
  const txOpts = dbTx ? { transaction: dbTx } : {};

  const budgets = await Budget.findAll({
    where: {
      userId,
      ...(categoryId
        ? { [Op.or]: [{ categoryId }, { categoryId: null }] }
        : {}),
    },
    ...txOpts,
  });

  for (const budget of budgets) {
    if (budget.categoryId && categoryId && budget.categoryId !== categoryId) {
      continue;
    }

    const { startDate, endDate } = getBudgetDateRange(budget);

    const spentResult = await Transaction.findOne({
      where: {
        userId,
        type: 'expense',
        date: { [Op.gte]: startDate, [Op.lte]: endDate },
        ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
      },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
      ...txOpts,
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
        triggeredAt: { [Op.gte]: startDate },
      },
      ...txOpts,
    });

    if (existingAlert) continue;

    await BudgetAlert.create(
      {
        budgetId: budget.id,
        userId,
        threshold,
        triggeredAt: new Date(),
      },
      txOpts
    );

    const exceeded = percentUsed >= 100;
    await createNotification(
      userId,
      'budget_exceeded',
      exceeded ? 'Budget exceeded' : 'Budget alert',
      exceeded
        ? `You've exceeded your "${budget.name}" budget (${Math.round(percentUsed)}% used).`
        : `You've used ${Math.round(percentUsed)}% of your "${budget.name}" budget.`,
      { budgetId: budget.id, percentUsed: Math.round(percentUsed) },
      !dbTx,
      dbTx
    );
  }
}
