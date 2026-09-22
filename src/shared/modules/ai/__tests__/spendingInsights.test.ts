import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction, createTestCategory } from '@testHelpers';
import { convertAmount } from '@shared/currency/currency.engine';
import { buildBudgetRecommendation, getSpendingInsights } from '../service/ai.service';

describe('getSpendingInsights', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('sums a category correctly across multiple currencies, matching convertAmount exactly', async () => {
    const user = await createTestUser({ currency: 'INR' });
    const category = await createTestCategory(user.id, { name: 'Dining' });

    await createTestTransaction(user.id, {
      categoryId: category.id,
      amount: 1000,
      currency: 'INR',
      date: new Date(),
    });
    await createTestTransaction(user.id, {
      categoryId: category.id,
      amount: 50,
      currency: 'USD',
      date: new Date(),
    });

    const result = await getSpendingInsights(user.id);

    const usdInInr = await convertAmount(50, 'USD', 'INR');
    const expectedTotal = Math.round((1000 + usdInInr) * 100) / 100;

    const topCategoryInsight = result.structuredInsights.find((i) => i.kind === 'top_category');
    expect(topCategoryInsight?.category).toBe('Dining');
    expect(topCategoryInsight?.amount).toBe(expectedTotal);
  });
});

describe('buildBudgetRecommendation', () => {
  it('recommends raising the budget when over 100% used', () => {
    const rec = buildBudgetRecommendation({
      catName: 'Dining',
      budgetAmount: 5000,
      catSpent: 6200,
      daysPassed: 20,
      daysRemaining: 10,
      daysInMonth: 30,
    });

    expect(rec).not.toBeNull();
    expect(rec?.kind).toBe('budget_recommendation');
    expect(rec?.title).toBe('Raise Dining Budget');
    expect(rec?.category).toBe('Dining');
    // projected monthly = (6200/20)*30 = 9300 -> rounded up to nearest 100 = 9300
    expect(rec?.amount).toBe(9300);
  });

  it('recommends reallocating when usage is low near month end', () => {
    const rec = buildBudgetRecommendation({
      catName: 'Travel',
      budgetAmount: 10000,
      catSpent: 1000,
      daysPassed: 28,
      daysRemaining: 2,
      daysInMonth: 30,
    });

    expect(rec).not.toBeNull();
    expect(rec?.kind).toBe('budget_recommendation');
    expect(rec?.title).toBe('Reallocate Travel Budget');
    // suggested = floor((1000*1.15)/100)*100 = floor(1150/100)*100 = 1100
    expect(rec?.amount).toBe(1100);
  });

  it('returns null for normal, on-pace budget usage', () => {
    const rec = buildBudgetRecommendation({
      catName: 'Groceries',
      budgetAmount: 8000,
      catSpent: 4000,
      daysPassed: 15,
      daysRemaining: 15,
      daysInMonth: 30,
    });

    expect(rec).toBeNull();
  });

  it('returns null for a zero or negative budget amount', () => {
    const rec = buildBudgetRecommendation({
      catName: 'Misc',
      budgetAmount: 0,
      catSpent: 500,
      daysPassed: 10,
      daysRemaining: 20,
      daysInMonth: 30,
    });

    expect(rec).toBeNull();
  });

  it('does not flag low usage unless the month is almost over', () => {
    const rec = buildBudgetRecommendation({
      catName: 'Travel',
      budgetAmount: 10000,
      catSpent: 1000,
      daysPassed: 10,
      daysRemaining: 20,
      daysInMonth: 30,
    });

    expect(rec).toBeNull();
  });
});
