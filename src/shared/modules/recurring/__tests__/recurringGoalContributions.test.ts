import { describe, it, expect, beforeAll } from 'vitest';
import { Goal, GoalContribution, RecurringSeries, Notification } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';
import { processRecurringGoalContributions } from '../service/recurringSeries.service';

async function createTestGoal(userId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return Goal.create({
    userId,
    name: 'Emergency Fund',
    type: 'emergency_fund',
    targetAmount: 100000,
    currentAmount: 0,
    ...overrides,
  } as never);
}

function yesterday(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

describe('processRecurringGoalContributions', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('contributes to the linked goal and advances nextDueDate when a series is due', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id);
    const series = await RecurringSeries.create({
      userId: user.id,
      merchant: 'Auto-Save',
      amount: 5000,
      cadence: 'monthly',
      nextDueDate: yesterday(),
      active: true,
      goalId: goal.id,
    } as never);

    await processRecurringGoalContributions();

    const updatedGoal = await Goal.findByPk(goal.id);
    expect(Number(updatedGoal!.currentAmount)).toBe(5000);

    const contributions = await GoalContribution.findAll({ where: { goalId: goal.id } });
    expect(contributions).toHaveLength(1);
    expect(contributions[0].notes).toBe('Automatic recurring contribution');

    const updatedSeries = await RecurringSeries.findByPk(series.id);
    expect(new Date(updatedSeries!.nextDueDate).getTime()).toBeGreaterThan(yesterday().getTime());
    expect(updatedSeries!.active).toBe(true);
  });

  it('deactivates the link and notifies instead of over-contributing when the goal is already complete', async () => {
    const user = await createTestUser();
    const goal = await createTestGoal(user.id, {
      currentAmount: 100000,
      completedAt: new Date(),
    });
    await RecurringSeries.create({
      userId: user.id,
      merchant: 'Auto-Save',
      amount: 5000,
      cadence: 'monthly',
      nextDueDate: yesterday(),
      active: true,
      goalId: goal.id,
    } as never);

    await processRecurringGoalContributions();

    const unchangedGoal = await Goal.findByPk(goal.id);
    expect(Number(unchangedGoal!.currentAmount)).toBe(100000);

    const contributions = await GoalContribution.findAll({ where: { goalId: goal.id } });
    expect(contributions).toHaveLength(0);

    const series = await RecurringSeries.findOne({ where: { userId: user.id } });
    expect(series!.active).toBe(false);
    expect(series!.goalId).toBeNull();

    const notifications = await Notification.findAll({
      where: { userId: user.id, type: 'recurring_expense' },
    });
    expect(notifications).toHaveLength(1);
  });

  it('does not touch series without a linked goal or not yet due', async () => {
    const user = await createTestUser();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const noGoalSeries = await RecurringSeries.create({
      userId: user.id,
      merchant: 'Rent',
      amount: 20000,
      cadence: 'monthly',
      nextDueDate: yesterday(),
      active: true,
      goalId: null,
    } as never);

    const goal = await createTestGoal(user.id);
    const notDueSeries = await RecurringSeries.create({
      userId: user.id,
      merchant: 'Auto-Save',
      amount: 5000,
      cadence: 'monthly',
      nextDueDate: tomorrow,
      active: true,
      goalId: goal.id,
    } as never);

    await processRecurringGoalContributions();

    expect(Number((await Goal.findByPk(goal.id))!.currentAmount)).toBe(0);
    expect((await RecurringSeries.findByPk(noGoalSeries.id))!.active).toBe(true);
    expect((await RecurringSeries.findByPk(notDueSeries.id))!.active).toBe(true);
  });
});
