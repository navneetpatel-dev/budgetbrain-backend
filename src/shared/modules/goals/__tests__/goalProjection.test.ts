import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { GoalContribution } from '@database/models';
import { createGoal, contributeToGoal, getGoal, listGoals } from '../goals.service';

async function backdateContribution(id: string, daysAgo: number) {
  const contributedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await GoalContribution.update({ contributedAt }, { where: { id } });
}

describe('Goal target-date projection', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('reports insufficient data with fewer than 2 recent contributions', async () => {
    const user = await createTestUser();
    const goal = await createGoal(user.id, { name: 'Vacation', targetAmount: 10000, type: 'vacation' });
    await contributeToGoal(user.id, goal.id, 1000);

    const result = await getGoal(user.id, goal.id);
    expect(result.projectedCompletionDate).toBeNull();
    expect(result.onTrack).toBeNull();
  });

  it('projects an on-track completion date within the target date', async () => {
    const user = await createTestUser();
    const targetDate = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const goal = await createGoal(user.id, {
      name: 'Car',
      targetAmount: 10000,
      type: 'car',
      targetDate,
    });

    const { contribution: c1 } = await contributeToGoal(user.id, goal.id, 3000);
    const { contribution: c2 } = await contributeToGoal(user.id, goal.id, 3000);
    await backdateContribution(c1.id, 60);
    await backdateContribution(c2.id, 30);
    // pace = 6000 / 90 days = ~66.67/day; remaining = 4000 -> ~60 days to complete, well within 200

    const result = await getGoal(user.id, goal.id);
    expect(result.projectedCompletionDate).not.toBeNull();
    expect(result.onTrack).toBe(true);
  });

  it('projects off-track when the pace implies completion after the target date', async () => {
    const user = await createTestUser();
    const targetDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const goal = await createGoal(user.id, {
      name: 'Home',
      targetAmount: 100000,
      type: 'home',
      targetDate,
    });

    const { contribution: c1 } = await contributeToGoal(user.id, goal.id, 100);
    const { contribution: c2 } = await contributeToGoal(user.id, goal.id, 100);
    await backdateContribution(c1.id, 60);
    await backdateContribution(c2.id, 30);

    const result = await getGoal(user.id, goal.id);
    expect(result.onTrack).toBe(false);
  });

  it('reports onTrack=true and no projected date once the goal is already complete', async () => {
    const user = await createTestUser();
    const goal = await createGoal(user.id, { name: 'Emergency Fund', targetAmount: 1000, type: 'emergency_fund' });
    const { contribution: c1 } = await contributeToGoal(user.id, goal.id, 500);
    const { contribution: c2 } = await contributeToGoal(user.id, goal.id, 600);
    await backdateContribution(c1.id, 10);
    await backdateContribution(c2.id, 1);

    const result = await getGoal(user.id, goal.id);
    expect(result.projectedCompletionDate).toBeNull();
    expect(result.onTrack).toBe(true);
  });

  it('returns null onTrack with no targetDate even with a valid pace', async () => {
    const user = await createTestUser();
    const goal = await createGoal(user.id, { name: 'Investments', targetAmount: 10000, type: 'investments' });
    const { contribution: c1 } = await contributeToGoal(user.id, goal.id, 1000);
    const { contribution: c2 } = await contributeToGoal(user.id, goal.id, 1000);
    await backdateContribution(c1.id, 60);
    await backdateContribution(c2.id, 30);

    const result = await getGoal(user.id, goal.id);
    expect(result.projectedCompletionDate).not.toBeNull();
    expect(result.onTrack).toBeNull();
  });

  it('enriches listGoals results with the same projection fields via a batched query', async () => {
    const user = await createTestUser();
    const goal = await createGoal(user.id, { name: 'Batch Test', targetAmount: 5000, type: 'other' });
    const { contribution: c1 } = await contributeToGoal(user.id, goal.id, 500);
    const { contribution: c2 } = await contributeToGoal(user.id, goal.id, 500);
    await backdateContribution(c1.id, 60);
    await backdateContribution(c2.id, 30);

    const { goals } = await listGoals(user.id, { page: 1, limit: 50 });
    const found = goals.find((g: any) => g.id === goal.id) as any;
    expect(found).toBeDefined();
    expect(found.projectedCompletionDate).not.toBeNull();
    expect(typeof found.onTrack === 'boolean' || found.onTrack === null).toBe(true);
  });
});
