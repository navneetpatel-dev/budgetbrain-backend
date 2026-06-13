import { Goal, GoalContribution, User } from '../../models';
import { AppError } from '../../utils/errors';
import { createNotification } from '../notifications/notification.service';

export async function createGoal(
  userId: string,
  data: {
    name: string;
    type: string;
    targetAmount: number;
    currency?: string;
    targetDate?: string;
  }
) {
  const user = await User.findByPk(userId);
  return Goal.create({
    userId,
    name: data.name,
    type: data.type as Goal['type'],
    targetAmount: data.targetAmount,
    currency: data.currency ?? user?.currency ?? 'INR',
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
  });
}

export async function listGoals(userId: string) {
  return Goal.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
}

export async function updateGoal(
  userId: string,
  id: string,
  data: { name?: string; targetAmount?: number; targetDate?: string }
) {
  const goal = await Goal.findOne({ where: { id, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');

  await goal.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
    ...(data.targetDate !== undefined && { targetDate: new Date(data.targetDate) }),
  });

  return goal;
}

export async function deleteGoal(userId: string, id: string) {
  const goal = await Goal.findOne({ where: { id, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');

  await GoalContribution.destroy({ where: { goalId: goal.id } });
  await goal.destroy();
}

async function checkAndCompleteGoal(goal: Goal, userId: string, newAmount: number) {
  const justCompleted = newAmount >= Number(goal.targetAmount) && !goal.completedAt;

  await goal.update({
    currentAmount: newAmount,
    completedAt: newAmount >= Number(goal.targetAmount) ? new Date() : null,
  });

  if (justCompleted) {
    await createNotification(
      userId,
      'goal_achieved',
      'Goal achieved!',
      `Congratulations! You've reached your "${goal.name}" goal.`,
      { goalId: goal.id }
    );
  }

  return goal;
}

export async function contributeToGoal(
  userId: string,
  goalId: string,
  amount: number,
  notes?: string
) {
  const goal = await Goal.findOne({ where: { id: goalId, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');

  const contribution = await GoalContribution.create({
    goalId: goal.id,
    userId,
    amount,
    notes: notes ?? null,
    contributedAt: new Date(),
  });

  const newAmount = Number(goal.currentAmount) + amount;
  const updatedGoal = await checkAndCompleteGoal(goal, userId, newAmount);

  return { contribution, goal: updatedGoal };
}
