import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import { Transaction, Goal } from '@database/models';
import { getSpendingTrends } from '../../expenses/service/transaction.service';
import { listCategories, archiveCategory, unarchiveCategory } from '../../categories/service/category.service';
import { contributeToGoal, listGoalContributions, getGoal } from '../../goals/service/goal.service';
import { listUsers } from '../../../../admin/features/admin/service/admin.service';

describe('Spending Trends, Categories & Goals Enhancements', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('computes daily, weekly, and monthly spending trends with continuous dates', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id);

    // Create an expense for today
    await Transaction.create({
      userId: user.id,
      type: 'expense',
      amount: 150.0,
      currency: 'INR',
      categoryId: category.id,
      date: new Date(),
    });

    const trends = await getSpendingTrends(user.id);

    expect(trends.daily).toHaveLength(14);
    expect(trends.weekly.length).toBeGreaterThanOrEqual(7);
    expect(trends.monthly).toHaveLength(6);

    // Last point in daily should reflect today's spending
    const todayIso = new Date().toISOString().slice(0, 10);
    const todayPoint = trends.daily.find((p) => p.date === todayIso);
    expect(todayPoint).toBeDefined();
    expect(todayPoint!.amount).toBe(150.0);
  });

  it('supports unarchiving categories and filtering archived ones', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id, { name: 'Active Category' });

    // Active listing
    let list = await listCategories(user.id);
    expect(list.categories.some((c: any) => c.id === category.id)).toBe(true);

    // Archive it
    await archiveCategory(user.id, category.id);
    list = await listCategories(user.id);
    expect(list.categories.some((c: any) => c.id === category.id)).toBe(false);

    // With includeArchived
    const listWithArchived = await listCategories(user.id, { includeArchived: true });
    expect(listWithArchived.categories.some((c: any) => c.id === category.id)).toBe(true);

    // Unarchive it
    await unarchiveCategory(user.id, category.id);
    list = await listCategories(user.id);
    expect(list.categories.some((c: any) => c.id === category.id)).toBe(true);
  });

  it('retrieves contribution history and includes it in getGoal', async () => {
    const user = await createTestUser();
    const goal = await Goal.create({
      userId: user.id,
      name: 'Emergency Fund',
      type: 'emergency_fund',
      targetAmount: 50000,
      currentAmount: 0,
      currency: 'INR',
    });

    await contributeToGoal(user.id, goal.id, 5000, 'Initial deposit');
    await contributeToGoal(user.id, goal.id, 2000, 'Second deposit');

    const fetchedGoal = await getGoal(user.id, goal.id);
    expect((fetchedGoal as any).contributions).toHaveLength(2);
    expect(Number((fetchedGoal as any).contributions[0].amount)).toBe(2000);

    const contributionsList = await listGoalContributions(user.id, goal.id);
    expect(contributionsList.contributions).toHaveLength(2);
    expect(contributionsList.total).toBe(2);
  });

  it('filters admin users list by search query and role', async () => {
    const uniqueKey = Math.random().toString(36).substring(2, 9);
    const user1 = await createTestUser({ email: `john.${uniqueKey}@example.com`, name: `John Doe ${uniqueKey}`, role: 'free' });
    const user2 = await createTestUser({ email: `jane.${uniqueKey}@example.com`, name: `Jane Smith ${uniqueKey}`, role: 'admin' });

    // Search by name
    const searchRes = await listUsers({ search: `John Doe ${uniqueKey}` });
    expect(searchRes.users.some((u: any) => u.id === user1.id)).toBe(true);
    expect(searchRes.users.some((u: any) => u.id === user2.id)).toBe(false);

    // Filter by role
    const roleRes = await listUsers({ role: 'admin' });
    expect(roleRes.users.some((u: any) => u.id === user2.id)).toBe(true);
    expect(roleRes.users.some((u: any) => u.id === user1.id)).toBe(false);
  });
});
