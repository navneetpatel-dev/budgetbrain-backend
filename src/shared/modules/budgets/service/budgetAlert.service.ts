import { Op, UniqueConstraintError, Transaction as DbTransaction } from 'sequelize';
import { Budget, BudgetAlert, Transaction, User } from '@database/models';
import { getBudgetDateRange } from '@shared/budgets/budgetPeriod';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { convertAndSum } from '@shared/currency/currency.engine';

/** Fixed progressive alert tiers, per requirements.md's budget-alert granularity gap. */
const ALERT_TIERS = [50, 80, 90, 100] as const;

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

    const spendRows = await Transaction.findAll({
      where: {
        userId,
        type: 'expense',
        date: { [Op.gte]: startDate, [Op.lte]: endDate },
        ...(budget.categoryId ? { categoryId: budget.categoryId } : {}),
      },
      attributes: ['amount', 'currency'],
      raw: true,
      ...txOpts,
    });
    const user = await User.findByPk(userId, { attributes: ['currency'], ...txOpts });
    const spent = await convertAndSum(spendRows, user?.currency ?? 'INR');
    const budgetAmount = Number(budget.amount);
    if (budgetAmount <= 0) continue;

    const percentUsed = (spent / budgetAmount) * 100;
    const tiersToCheck = ALERT_TIERS.filter((tier) => tier >= budget.alertThreshold);

    for (const threshold of tiersToCheck) {
      if (percentUsed < threshold) continue;

      let created = false;
      try {
        const [, wasCreated] = await BudgetAlert.findOrCreate({
          where: {
            budgetId: budget.id,
            userId,
            threshold,
            periodStart: startDate,
          },
          defaults: {
            budgetId: budget.id,
            userId,
            threshold,
            periodStart: startDate,
            triggeredAt: new Date(),
          },
          ...txOpts,
        });
        created = wasCreated;
      } catch (err) {
        if (err instanceof UniqueConstraintError) continue;
        throw err;
      }

      if (!created) continue;

      const exceeded = threshold >= 100;
      await createNotification(
        userId,
        'budget_exceeded',
        exceeded ? 'Budget exceeded' : 'Budget alert',
        exceeded
          ? `You've exceeded your "${budget.name}" budget (${Math.round(percentUsed)}% used).`
          : `You've used ${threshold}% of your "${budget.name}" budget.`,
        { budgetId: budget.id, percentUsed: Math.round(percentUsed), threshold },
        !dbTx,
        dbTx
      );
    }
  }
}
