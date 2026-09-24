import { Op, UniqueConstraintError, Transaction as DbTransaction } from 'sequelize';
import { Budget, BudgetAlert, Transaction, User } from '@database/models';
import { getBudgetDateRange } from '@shared/budgets/budgetPeriod';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { convertAndSum } from '@shared/currency/currency.engine';
import { NET_SPENDING_TYPES, toNetSpendingRows } from '@shared/modules/expenses/service/transactionKinds';

/** Fixed progressive alert tiers, per requirements.md's budget-alert granularity gap. */
const ALERT_TIERS = [50, 80, 90, 100] as const;

interface ExpenseRow {
  type: string;
  amount: unknown;
  currency: string | null;
  categoryId: string | null;
}

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

  const relevantBudgets = budgets.filter(
    (budget) => !(budget.categoryId && categoryId && budget.categoryId !== categoryId)
  );
  if (relevantBudgets.length === 0) return;

  // Fetched once, not once per budget: every budget in this check belongs to the same user.
  const user = await User.findByPk(userId, { attributes: ['currency'], ...txOpts });
  const userCurrency = user?.currency ?? 'INR';

  // Most budgets share the same tracking window (e.g. every 'monthly' budget tracks the
  // current calendar month), so fetch each distinct window's expense rows once and reuse
  // them across every budget in that window, instead of one Transaction.findAll per budget.
  const rowsByWindow = new Map<string, ExpenseRow[]>();
  async function getWindowRows(startDate: string, endDate: string): Promise<ExpenseRow[]> {
    const key = `${startDate}|${endDate}`;
    const cached = rowsByWindow.get(key);
    if (cached) return cached;

    const rows = (await Transaction.findAll({
      // Net of refunds, matching budget.service's spent figure.
      where: { userId, type: NET_SPENDING_TYPES, date: { [Op.gte]: startDate, [Op.lte]: endDate } },
      attributes: ['type', 'amount', 'currency', 'categoryId'],
      raw: true,
      ...txOpts,
    })) as unknown as ExpenseRow[];
    rowsByWindow.set(key, rows);
    return rows;
  }

  for (const budget of relevantBudgets) {
    const { startDate, endDate } = getBudgetDateRange(budget);
    const windowRows = await getWindowRows(startDate, endDate);
    // A null-category budget tracks total spend across every category (see sumExpensesInRange's
    // "no categoryId filter" behavior in budget.service.ts) — a specific-category budget only
    // counts rows matching it.
    const matchingRows = budget.categoryId
      ? windowRows.filter((row) => row.categoryId === budget.categoryId)
      : windowRows;

    const spent = await convertAndSum(toNetSpendingRows(matchingRows), userCurrency);
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
