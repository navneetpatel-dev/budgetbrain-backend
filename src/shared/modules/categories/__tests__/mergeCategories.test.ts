import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestCategory, createTestTransaction } from '@testHelpers';
import { Budget, MerchantCategoryRule, RecurringSeries } from '@database/models';
import { mergeCategories } from '../service/category.service';
import { AppError } from '@shared/errors';

describe('mergeCategories', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('reassigns transactions, budgets, recurring series, and merchant rules, then archives the source category', async () => {
    const user = await createTestUser();
    const fromCategory = await createTestCategory(user.id, { name: 'Dining' });
    const toCategory = await createTestCategory(user.id, { name: 'Restaurants' });

    const transaction = await createTestTransaction(user.id, { categoryId: fromCategory.id });
    const budget = await Budget.create({
      userId: user.id,
      name: 'Dining budget',
      type: 'monthly',
      amount: 5000,
      currency: 'INR',
      categoryId: fromCategory.id,
      startDate: new Date(),
    } as any);
    const series = await RecurringSeries.create({
      userId: user.id,
      merchant: 'Local Cafe',
      categoryId: fromCategory.id,
      amount: 300,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: new Date(),
    } as any);
    const rule = await MerchantCategoryRule.create({
      userId: user.id,
      merchant: 'Local Cafe',
      categoryId: fromCategory.id,
    });

    const result = await mergeCategories(user.id, fromCategory.id, toCategory.id);
    expect(result.id).toBe(toCategory.id);

    await transaction.reload();
    await budget.reload();
    await series.reload();
    await rule.reload();
    await fromCategory.reload();

    expect(transaction.categoryId).toBe(toCategory.id);
    expect(budget.categoryId).toBe(toCategory.id);
    expect(series.categoryId).toBe(toCategory.id);
    expect(rule.categoryId).toBe(toCategory.id);
    expect(fromCategory.isArchived).toBe(true);
  });

  it('rejects merging a category into itself', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id);

    await expect(mergeCategories(user.id, category.id, category.id)).rejects.toThrow(AppError);
  });

  it('rejects merging another user\'s category (cross-user isolation)', async () => {
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const fromCategory = await createTestCategory(owner.id);
    const toCategory = await createTestCategory(owner.id);

    await expect(
      mergeCategories(attacker.id, fromCategory.id, toCategory.id)
    ).rejects.toThrow('Source category not found');
  });

  it('rejects when the target category does not exist for this user', async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const fromCategory = await createTestCategory(user.id);
    const foreignCategory = await createTestCategory(other.id);

    await expect(
      mergeCategories(user.id, fromCategory.id, foreignCategory.id)
    ).rejects.toThrow('Target category not found');
  });
});
