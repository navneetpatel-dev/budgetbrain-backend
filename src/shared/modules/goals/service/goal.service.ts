import { Op, type Transaction } from 'sequelize';
import { Goal, GoalContribution, User, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { createNotification } from '@shared/modules/notifications/service/notification.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type { CreateGoalInput, UpdateGoalInput } from '../types';

const PROJECTION_WINDOW_DAYS = 90;
const MIN_CONTRIBUTIONS_FOR_PROJECTION = 2;

export interface GoalProjection {
  projectedCompletionDate: string | null;
  onTrack: boolean | null;
}

/**
 * Server-computed pace projection — service-computed rather than a Sequelize VIRTUAL,
 * since it needs GoalContribution history (same reasoning as Budget.spentPercentage).
 * Uses the trailing-90-day contribution pace; goals with fewer than 2 contributions in
 * that window report an explicit "insufficient data" state instead of a volatile guess
 * off a single data point.
 */
function computeGoalProjection(
  goal: { targetAmount: number | string; currentAmount: number | string; targetDate: Date | string | null },
  contributions: Array<{ amount: number | string; contributedAt: Date | string }>
): GoalProjection {
  const windowStart = Date.now() - PROJECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recent = contributions.filter((c) => new Date(c.contributedAt).getTime() >= windowStart);

  const remaining = Number(goal.targetAmount) - Number(goal.currentAmount);
  if (remaining <= 0) {
    return { projectedCompletionDate: null, onTrack: true };
  }

  if (recent.length < MIN_CONTRIBUTIONS_FOR_PROJECTION) {
    return { projectedCompletionDate: null, onTrack: null };
  }

  const totalRecent = recent.reduce((sum, c) => sum + Number(c.amount), 0);
  const dailyPace = totalRecent / PROJECTION_WINDOW_DAYS;
  if (dailyPace <= 0) {
    return { projectedCompletionDate: null, onTrack: false };
  }

  const daysToComplete = remaining / dailyPace;
  const projectedCompletionDate = new Date(Date.now() + daysToComplete * 24 * 60 * 60 * 1000);
  const onTrack = goal.targetDate ? projectedCompletionDate <= new Date(goal.targetDate) : null;

  return {
    projectedCompletionDate: projectedCompletionDate.toISOString().slice(0, 10),
    onTrack,
  };
}

async function enrichGoalsWithProjection(goals: Goal[]) {
  if (goals.length === 0) return [];

  const windowStart = new Date(Date.now() - PROJECTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const contributions = (await GoalContribution.findAll({
    where: { goalId: goals.map((g) => g.id), contributedAt: { [Op.gte]: windowStart } },
    attributes: ['goalId', 'amount', 'contributedAt'],
    raw: true,
  })) as unknown as Array<{ goalId: string; amount: number; contributedAt: Date }>;

  const byGoal = new Map<string, Array<{ amount: number; contributedAt: Date }>>();
  for (const c of contributions) {
    const list = byGoal.get(c.goalId) ?? [];
    list.push({ amount: c.amount, contributedAt: c.contributedAt });
    byGoal.set(c.goalId, list);
  }

  return goals.map((goal) => ({
    ...goal.toJSON(),
    ...computeGoalProjection(goal, byGoal.get(goal.id) ?? []),
  }));
}

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
  const goal = await Goal.findOne({
    where: { id, userId },
    include: [
      {
        model: GoalContribution,
        as: 'contributions',
        attributes: ['id', 'amount', 'notes', 'contributedAt', 'createdAt'],
      },
    ],
    order: [[{ model: GoalContribution, as: 'contributions' }, 'contributedAt', 'DESC']],
  });
  if (!goal) throw new AppError(404, 'Goal not found');

  const contributions = (goal.get('contributions') as GoalContribution[] | undefined) ?? [];
  return {
    ...goal.toJSON(),
    ...computeGoalProjection(goal, contributions),
  };
}

export async function listGoalContributions(
  userId: string,
  goalId: string,
  filters: PaginationInput = {}
) {
  const goal = await Goal.findOne({ where: { id: goalId, userId } });
  if (!goal) throw new AppError(404, 'Goal not found');

  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await GoalContribution.findAndCountAll({
    where: { goalId },
    order: [['contributedAt', 'DESC']],
    limit,
    offset,
  });

  return paginatedResult('contributions', rows, count, page, limit);
}

export async function listGoals(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await Goal.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  const goals = await enrichGoalsWithProjection(rows);
  return paginatedResult('goals', goals, count, page, limit);
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

/**
 * `externalTransaction` lets a caller that already opened its own transaction (e.g. an
 * automated recurring-contribution job that also needs to atomically advance a due date)
 * fold this contribution into it, instead of nesting a second top-level transaction.
 */
export async function contributeToGoal(
  userId: string,
  goalId: string,
  amount: number,
  notes?: string,
  externalTransaction?: Transaction
) {
  const runInTransaction = async (t: Transaction) => {
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
  };

  const { contribution, goal, justCompleted } = externalTransaction
    ? await runInTransaction(externalTransaction)
    : await sequelize.transaction(runInTransaction);

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
