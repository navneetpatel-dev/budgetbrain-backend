import { describe, it, expect, beforeAll } from 'vitest';
import { BudgetAlert } from '@database/models';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { createBudget } from '../service/budget.service';
import { checkBudgetAlertsAfterExpense } from '../service/budgetAlert.service';

describe('checkBudgetAlertsAfterExpense — progressive alert tiers', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('fires each tier independently as spend rises through 50/80/90/100%', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Groceries',
      type: 'monthly',
      amount: 100,
      startDate: new Date().toISOString().slice(0, 10),
    });

    // 55% used -> only the 50% tier should fire.
    await createTestTransaction(user.id, { type: 'expense', amount: 55, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);

    let alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id }, order: [['threshold', 'ASC']] });
    expect(alerts.map((a) => a.threshold)).toEqual([50]);

    // 82% used -> the 80% tier should now also fire, 50% should not duplicate.
    await createTestTransaction(user.id, { type: 'expense', amount: 27, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);

    alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id }, order: [['threshold', 'ASC']] });
    expect(alerts.map((a) => a.threshold)).toEqual([50, 80]);

    // 105% used -> 90% and 100% tiers both fire in the same check.
    await createTestTransaction(user.id, { type: 'expense', amount: 23, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);

    alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id }, order: [['threshold', 'ASC']] });
    expect(alerts.map((a) => a.threshold)).toEqual([50, 80, 90, 100]);
  });

  it('does not create a duplicate alert at the same tier within one period', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Dining',
      type: 'monthly',
      amount: 100,
      startDate: new Date().toISOString().slice(0, 10),
    });

    await createTestTransaction(user.id, { type: 'expense', amount: 90, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);
    await checkBudgetAlertsAfterExpense(user.id, null);
    await checkBudgetAlertsAfterExpense(user.id, null);

    const alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id } });
    expect(alerts.map((a) => a.threshold).sort()).toEqual([50, 80, 90]);
  });

  it('respects alertThreshold as a floor, filtering out lower tiers', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Subscriptions',
      type: 'monthly',
      amount: 100,
      startDate: new Date().toISOString().slice(0, 10),
      alertThreshold: 90,
    });

    // 85% used -> below the 90 floor, no tiers (50/80) should fire despite exceeding them.
    await createTestTransaction(user.id, { type: 'expense', amount: 85, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);

    let alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id } });
    expect(alerts).toHaveLength(0);

    // 95% used -> only the 90 tier is eligible and crossed; 100 not yet crossed.
    await createTestTransaction(user.id, { type: 'expense', amount: 10, date: new Date() });
    await checkBudgetAlertsAfterExpense(user.id, null);

    alerts = await BudgetAlert.findAll({ where: { budgetId: budget.id } });
    expect(alerts.map((a) => a.threshold)).toEqual([90]);
  });
});
