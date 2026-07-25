import { Goal, GoalContribution, User, sequelize } from '../../../../shared/models';
import { AppError } from '../../../shared/utils/errors';
import { createNotification } from '../../notifications/service/notification.service';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type { CreateGoalInput, UpdateGoalInput } from '../types';

export async function createGoal(userId: string, data: CreateGoalInput) {
  const user = await User.findByPk(userId);
  const goal = await Goal.create({
    userId,
    name: data.name,
    type: data.type as Goal['type'],
    targetAmount: data.targetAmount,
    currency: data.currency ?? user?.currency ?? 'INR',
    targetDate: data.targetDate ? new Date(data.targetDate) : null,
  });

  await writeAuditLog({
    action: AuditAction.GOAL_CREATE,
    resource: AuditResource.GOAL,
    resourceId: goal.id,
    actorUserId: userId,
    afterState: { name: goal.name, targetAmount: goal.targetAmount, type: goal.type },
  });

  return goal;
}

export async function getGoal(userId: string, id: string) {
  const goal = await Goal.findOne({ where: { id, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');
  return goal;
}

export async function listGoals(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await Goal.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('goals', rows, count, page, limit);
}

export async function listGoalsForDashboard(userId: string, maxItems = 5) {
  const { goals } = await listGoals(userId, { page: 1, limit: maxItems });
  return goals;
}

export async function updateGoal(userId: string, id: string, data: UpdateGoalInput) {
  const goal = await Goal.findOne({ where: { id, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');

  const beforeState = {
    name: goal.name,
    targetAmount: goal.targetAmount,
    targetDate: goal.targetDate,
  };

  await goal.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
    ...(data.targetDate !== undefined && { targetDate: new Date(data.targetDate) }),
  });

  await writeAuditLog({
    action: AuditAction.GOAL_UPDATE,
    resource: AuditResource.GOAL,
    resourceId: id,
    actorUserId: userId,
    beforeState,
    afterState: {
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
    },
  });

  return goal;
}

export async function deleteGoal(userId: string, id: string) {
  await sequelize.transaction(async (t) => {
    const goal = await Goal.findOne({
      where: { id, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!goal) throw new AppError(404, 'Goal not found');

    await GoalContribution.destroy({ where: { goalId: goal.id }, transaction: t });
    await goal.destroy({ transaction: t });

    await writeAuditLog({
      action: AuditAction.GOAL_DELETE,
      resource: AuditResource.GOAL,
      resourceId: id,
      actorUserId: userId,
      beforeState: { name: goal.name, targetAmount: goal.targetAmount },
      severity: 'warning',
      transaction: t,
    });
  });
}

export async function contributeToGoal(
  userId: string,
  goalId: string,
  amount: number,
  notes?: string
) {
  const { contribution, goal, justCompleted } = await sequelize.transaction(async (t) => {
    const goal = await Goal.findOne({
      where: { id: goalId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!goal) throw new AppError(404, 'Goal not found');

    const contribution = await GoalContribution.create(
      {
        goalId: goal.id,
        userId,
        amount,
        notes: notes ?? null,
        contributedAt: new Date(),
      },
      { transaction: t }
    );

    const newAmount = Number(goal.currentAmount) + amount;
    const justCompleted = newAmount >= Number(goal.targetAmount) && !goal.completedAt;

    await goal.update(
      {
        currentAmount: newAmount,
        completedAt: newAmount >= Number(goal.targetAmount) ? new Date() : null,
      },
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.GOAL_CONTRIBUTE,
      resource: AuditResource.GOAL,
      resourceId: goalId,
      actorUserId: userId,
      afterState: { amount, currentAmount: newAmount, completed: justCompleted },
      transaction: t,
    });

    return { contribution, goal, justCompleted };
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

  return { contribution, goal };
}
