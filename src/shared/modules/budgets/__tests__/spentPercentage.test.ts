import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { createBudget, getBudget } from '../service/budget.service';

describe('Budget.spentPercentage — server-computed, capped 0-100', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('computes spentPercentage from spent/effectiveAmount, rounded', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Groceries',
      type: 'monthly',
      amount: 1000,
      startDate: new Date().toISOString().slice(0, 10),
    });

    await createTestTransaction(user.id, { type: 'expense', amount: 333, date: new Date() });

    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.spent).toBe(333);
    expect(enriched.spentPercentage).toBe(33);
  });

  it('caps at 100 when spending exceeds the budget', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Overspent category',
      type: 'monthly',
      amount: 100,
      startDate: new Date().toISOString().slice(0, 10),
    });

    await createTestTransaction(user.id, { type: 'expense', amount: 500, date: new Date() });

    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.spentPercentage).toBe(100);
  });

  it('returns 0 (not NaN/Infinity) for a zero-amount budget', async () => {
    const user = await createTestUser();
    const budget = await createBudget(user.id, {
      name: 'Zero budget',
      type: 'monthly',
      amount: 0,
      startDate: new Date().toISOString().slice(0, 10),
    });

    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.spentPercentage).toBe(0);
  });
});
