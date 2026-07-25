import { Op, fn, col } from 'sequelize';
import {
  User,
  Subscription,
  AuditLog,
  Transaction,
  AiConversation,
  RefreshToken,
  SupportTicket,
  sequelize,
} from '../../../../shared/models';
import { AppError } from '../../../shared/utils/errors';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import type { TicketStatus } from '../../../../shared/models/SupportTicket';
import type {
  UpdateSupportTicketInput,
  UpdateUserInput,
} from '../types';

export interface AuditLogFilters {
  page?: number;
  limit?: number;
  action?: string;
  resource?: string;
  source?: string;
  outcome?: string;
  severity?: string;
  actorUserId?: string;
  requestId?: string;
  startDate?: string;
  endDate?: string;
}

const PLAN_PRICING: Record<string, number> = { monthly: 199, yearly: 1499 / 12, lifetime: 0 };

function computeMrrByPlan(rows: Array<{ plan: string; count: string }>) {
  const mrrByPlan = rows.map((row) => {
    const count = Number(row.count);
    const unitPrice = PLAN_PRICING[row.plan] ?? 0;
    return { plan: row.plan, count, revenue: Math.round(unitPrice * count) };
  });
  const estimatedMRR = mrrByPlan.reduce((sum, p) => sum + p.revenue, 0);
  return { estimatedMRR, mrrByPlan };
}

export async function getAdminDashboard() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgoStart = new Date(thirtyDaysAgo);
  thirtyDaysAgoStart.setHours(0, 0, 0, 0);

  const [totalUsers, premiumUsers, activeSubscriptions, recentUsers, revenueEstimate, aiUsage, dau, mau] =
    await Promise.all([
      User.count(),
      User.count({ where: { role: { [Op.in]: ['premium', 'lifetime'] } } }),
      Subscription.count({ where: { status: 'active' } }),
      User.count({ where: { createdAt: { [Op.gte]: thirtyDaysAgo } } }),
      Subscription.findAll({
        where: { status: 'active' },
        attributes: ['plan', [fn('COUNT', col('id')), 'count']],
        group: ['plan'],
        raw: true,
      }),
      AiConversation.count({ where: { createdAt: { [Op.gte]: thirtyDaysAgo } } }),
      User.count({ where: { lastLoginAt: { [Op.gte]: today } } }),
      User.count({ where: { lastLoginAt: { [Op.gte]: thirtyDaysAgoStart } } }),
    ]);

  const { estimatedMRR } = computeMrrByPlan(
    revenueEstimate as unknown as Array<{ plan: string; count: string }>
  );

  return {
    totalUsers,
    premiumUsers,
    activeSubscriptions,
    newUsersLast30Days: recentUsers,
    estimatedMRR,
    aiConversationsLast30Days: aiUsage,
    conversionRate: totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0,
    dau,
    mau,
    retentionRate: mau > 0 ? Math.round((dau / mau) * 100) : 0,
  };
}

export async function listUsers(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows, count } = await User.findAndCountAll({
    attributes: { exclude: ['passwordHash'] },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { users: rows, total: count, page, limit };
}

export async function listSubscriptions(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows, count } = await Subscription.findAndCountAll({
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { subscriptions: rows, total: count, page, limit };
}

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 50, 100);
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (filters.action) where.action = filters.action;
  if (filters.resource) where.resource = filters.resource;
  if (filters.source) where.source = filters.source;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.severity) where.severity = filters.severity;
  if (filters.actorUserId) where.userId = filters.actorUserId;
  if (filters.requestId) where.requestId = filters.requestId;
  if (filters.startDate || filters.endDate) {
    where.createdAt = {
      ...(filters.startDate ? { [Op.gte]: new Date(filters.startDate) } : {}),
      ...(filters.endDate ? { [Op.lte]: new Date(filters.endDate) } : {}),
    };
  }

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return {
    logs: rows,
    total: count,
    page,
    limit,
    filters: {
      action: filters.action ?? null,
      resource: filters.resource ?? null,
      source: filters.source ?? null,
      outcome: filters.outcome ?? null,
      severity: filters.severity ?? null,
    },
  };
}

export async function getAuditLog(id: string) {
  const log = await AuditLog.findByPk(id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
  });
  if (!log) throw new AppError(404, 'Audit log not found', 'NOT_FOUND');
  return log;
}

export async function getTransactionStats() {
  const [totalTransactions, totalExpenses] = await Promise.all([
    Transaction.count(),
    Transaction.sum('amount', { where: { type: 'expense' } }),
  ]);
  return { totalTransactions, totalExpenseVolume: Number(totalExpenses ?? 0) };
}

export async function getRevenue() {
  const [activeSubscriptions, revenueEstimate] = await Promise.all([
    Subscription.count({ where: { status: 'active' } }),
    Subscription.findAll({
      where: { status: 'active' },
      attributes: ['plan', [fn('COUNT', col('id')), 'count']],
      group: ['plan'],
      raw: true,
    }),
  ]);

  const { estimatedMRR, mrrByPlan } = computeMrrByPlan(
    revenueEstimate as unknown as Array<{ plan: string; count: string }>
  );

  return { estimatedMRR, mrrByPlan, activeSubscriptions };
}

export async function listAiUsage(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows, count } = await AiConversation.findAndCountAll({
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const conversations = rows.map((row) => {
    const json = row.toJSON() as {
      id: string;
      userId: string;
      title: string;
      messages: unknown[];
      createdAt: Date;
      updatedAt: Date;
      user?: { id: string; email: string; name: string | null };
    };
    return {
      id: json.id,
      userId: json.userId,
      title: json.title,
      messageCount: Array.isArray(json.messages) ? json.messages.length : 0,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      user: json.user,
    };
  });

  return { conversations, total: count, page, limit };
}

export async function listSupportTickets(page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const { rows, count } = await SupportTicket.findAndCountAll({
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { tickets: rows, total: count, page, limit };
}

export async function updateSupportTicket(
  id: string,
  data: UpdateSupportTicketInput,
  adminUserId?: string
) {
  return sequelize.transaction(async (t) => {
    const ticket = await SupportTicket.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!ticket) {
      throw new AppError(404, 'Support ticket not found', 'NOT_FOUND');
    }

    const beforeState = {
      status: ticket.status,
      adminNotes: ticket.adminNotes,
      resolvedAt: ticket.resolvedAt,
    };

    const updates: Partial<{ status: TicketStatus; adminNotes: string | null; resolvedAt: Date | null }> =
      {};
    if (data.status) {
      updates.status = data.status;
      updates.resolvedAt = ['resolved', 'closed'].includes(data.status) ? new Date() : null;
    }
    if (data.adminNotes !== undefined) {
      updates.adminNotes = data.adminNotes;
    }

    await ticket.update(updates, { transaction: t });

    if (adminUserId) {
      await writeAuditLog({
        action: AuditAction.SUPPORT_TICKET_UPDATE,
        resource: AuditResource.SUPPORT_TICKET,
        resourceId: id,
        actorUserId: adminUserId,
        actorType: 'admin',
        beforeState,
        afterState: { ...beforeState, ...updates },
        transaction: t,
      });
    }

    return SupportTicket.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
      transaction: t,
    });
  });
}

export async function getUser(id: string) {
  const user = await User.findByPk(id, {
    attributes: { exclude: ['passwordHash'] },
  });
  if (!user) {
    throw new AppError(404, 'User not found', 'NOT_FOUND');
  }
  return user;
}

export async function updateUser(
  id: string,
  data: UpdateUserInput,
  adminUserId?: string
) {
  return sequelize.transaction(async (t) => {
    const user = await User.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) {
      throw new AppError(404, 'User not found', 'NOT_FOUND');
    }

    const beforeState = { role: user.role, isSuspended: user.isSuspended };

    if (data.role) {
      await user.update({ role: data.role }, { transaction: t });
      if (adminUserId) {
        await writeAuditLog({
          action: AuditAction.USER_ROLE_CHANGE,
          resource: AuditResource.USER,
          resourceId: id,
          actorUserId: adminUserId,
          actorType: 'admin',
          beforeState: { role: beforeState.role },
          afterState: { role: data.role },
          severity: 'warning',
          transaction: t,
        });
      }
    }

    if (data.suspended !== undefined) {
      await user.update({ isSuspended: data.suspended }, { transaction: t });
      if (data.suspended) {
        await RefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: id, revokedAt: null }, transaction: t }
        );
      }
      if (adminUserId) {
        await writeAuditLog({
          action: data.suspended ? AuditAction.USER_SUSPEND : AuditAction.USER_UNSUSPEND,
          resource: AuditResource.USER,
          resourceId: id,
          actorUserId: adminUserId,
          actorType: 'admin',
          beforeState: { isSuspended: beforeState.isSuspended },
          afterState: { isSuspended: data.suspended },
          severity: 'critical',
          transaction: t,
        });
      }
    }

    return User.findByPk(id, {
      attributes: { exclude: ['passwordHash'] },
      transaction: t,
    });
  });
}
