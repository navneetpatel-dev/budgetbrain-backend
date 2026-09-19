import { describe, it, expect, beforeAll } from 'vitest';
import { Budget } from '@database/models';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { createBudget, updateBudget, getBudget } from '../service/budget.service';

/** N calendar months before "now", as a YYYY-MM-DD date-only string. */
function monthsAgo(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - n, 15);
  return d.toISOString().slice(0, 10);
}

describe('Budget rollover — single vs compounding mode', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('single mode (default) rolls over only the immediately preceding period — unchanged behavior', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Groceries',
      type: 'monthly',
      amount: 100,
      startDate: monthsAgo(3),
      rollover: true,
    });

    // Underspend 2 periods ago (should be ignored by single mode) and last period (should count).
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 20,
      date: new Date(monthsAgo(2)),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 60,
      date: new Date(monthsAgo(1)),
    });

    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.rolloverMode).toBe('single');
    // Only last period's leftover (100 - 60 = 40) counts, not 2-periods-ago's leftover too.
    expect(enriched.rolloverAmount).toBe(40);
  });

  it('compounding mode accumulates leftover/deficit across every period since rolloverStartedAt', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Dining',
      type: 'monthly',
      amount: 100,
      startDate: monthsAgo(3),
      rollover: true,
      rolloverMode: 'compounding',
    });

    // Anchor the compounding window to include all 3 prior periods (createBudget would
    // otherwise anchor rolloverStartedAt to "now", per the anti-retroactive-compounding rule).
    await Budget.update({ rolloverStartedAt: new Date(monthsAgo(3)) }, { where: { id: budget.id } });

    // 3 periods ago: underspent by 20 (100 - 80).
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 80,
      date: new Date(monthsAgo(3)),
    });
    // 2 periods ago: overspent by 30 (100 - 130 = -30).
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 130,
      date: new Date(monthsAgo(2)),
    });
    // 1 period ago: underspent by 10 (100 - 90).
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 90,
      date: new Date(monthsAgo(1)),
    });

    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.rolloverMode).toBe('compounding');
    // Accumulated: +20 - 30 + 10 = 0, across all 3 periods, not just the last one.
    expect(enriched.rolloverAmount).toBe(0);
  });

  it('caps the compounding walk at 24 periods without erroring on a very old budget', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Long-lived subscription budget',
      type: 'monthly',
      amount: 50,
      startDate: monthsAgo(36),
      rollover: true,
      rolloverMode: 'compounding',
    });
    await Budget.update({ rolloverStartedAt: new Date(monthsAgo(36)) }, { where: { id: budget.id } });

    // No transactions needed — just confirm the read doesn't throw and returns a number.
    const enriched = await getBudget(user.id, budget.id);
    expect(Number.isFinite(enriched.rolloverAmount)).toBe(true);
    // 24 periods of a fully-unspent $50 budget each = 1200.
    expect(enriched.rolloverAmount).toBe(1200);
  });

  it('switching to compounding mid-life does not retroactively compound pre-switch periods', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Utilities',
      type: 'monthly',
      amount: 100,
      startDate: monthsAgo(3),
      rollover: true,
      // starts in 'single' mode
    });

    // 2 periods ago: heavy underspend that should NOT be compounded in once we switch later.
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 10,
      date: new Date(monthsAgo(2)),
    });
    // 1 period ago: on-budget.
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 100,
      date: new Date(monthsAgo(1)),
    });

    await updateBudget(user.id, budget.id, { rolloverMode: 'compounding' });

    const updated = await Budget.findByPk(budget.id);
    expect(updated?.rolloverStartedAt).not.toBeNull();

    const enriched = await getBudget(user.id, budget.id);
    // rolloverStartedAt was just set to "now", so getPeriodsBetween's walk (which only goes
    // back to the period immediately before the current one) finds no period at or after
    // that anchor — the 2-periods-ago underspend of +90 must not be included.
    expect(enriched.rolloverAmount).toBe(0);
  });
});
