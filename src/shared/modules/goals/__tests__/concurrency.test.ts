import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createGoal, contributeToGoal, getGoal } from '../service/goal.service';
import { GoalContribution } from '@database/models';

describe('Goal Concurrency & Row Locking', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('handles simultaneous concurrent contributions without lost updates', async () => {
    const user = await createTestUser();
    const goal = await createGoal(user.id, {
      name: 'Emergency Fund Concurrency Test',
      targetAmount: 50000,
      type: 'emergency_fund',
    });

    const contributionCount = 10;
    const contributionAmount = 500;

    // Fire 10 simultaneous contributions in parallel
    await Promise.all(
      Array.from({ length: contributionCount }).map((_, i) =>
        contributeToGoal(user.id, goal.id, contributionAmount, `Concurrent contribution ${i + 1}`)
      )
    );

    // Verify final goal total matches exact sum (10 * 500 = 5000)
    const updatedGoal = await getGoal(user.id, goal.id);
    const expectedTotal = contributionCount * contributionAmount;

    expect(Number(updatedGoal.currentAmount)).toBe(expectedTotal);

    // Verify exactly 10 contributions were recorded in database
    const contributions = await GoalContribution.findAll({ where: { goalId: goal.id } });
    expect(contributions).toHaveLength(contributionCount);
  });
});
