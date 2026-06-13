import { Op, fn, col } from 'sequelize';
import { User, Subscription, AuditLog, Transaction, AiConversation, RefreshToken, SupportTicket } from '../../models';
import { AppError } from '../../utils/errors';
import { logAuditEvent } from '../shared/audit.service';
import type { UserRole } from '../../models/User';
import type { TicketStatus } from '../../models/SupportTicket';

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

export async function listAuditLogs(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const { rows, count } = await AuditLog.findAndCountAll({
    include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return { logs: rows, total: count, page, limit };
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
  data: { status?: TicketStatus; adminNotes?: string | null },
  adminUserId?: string
) {
  const ticket = await SupportTicket.findByPk(id);
  if (!ticket) {
    throw new AppError(404, 'Support ticket not found', 'NOT_FOUND');
  }

  const updates: Partial<{ status: TicketStatus; adminNotes: string | null; resolvedAt: Date | null }> =
    {};
  if (data.status) {
    updates.status = data.status;
    updates.resolvedAt = ['resolved', 'closed'].includes(data.status) ? new Date() : null;
  }
  if (data.adminNotes !== undefined) {
    updates.adminNotes = data.adminNotes;
  }

  await ticket.update(updates);

  if (adminUserId) {
    await logAuditEvent(adminUserId, 'admin_update_ticket', 'support_ticket', id, data);
  }

  return SupportTicket.findByPk(id, {
    include: [{ model: User, as: 'user', attributes: ['id', 'email', 'name'] }],
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
  data: { role?: UserRole; suspended?: boolean },
  adminUserId?: string
) {
  const user = await User.findByPk(id);
  if (!user) {
    throw new AppError(404, 'User not found', 'NOT_FOUND');
  }

  if (data.role) {
    await user.update({ role: data.role });
  }

  if (data.suspended !== undefined) {
    await user.update({ isSuspended: data.suspended });
    if (data.suspended) {
      await RefreshToken.update(
        { revokedAt: new Date() },
        { where: { userId: id, revokedAt: null } }
      );
    }
  }

  if (adminUserId) {
    await logAuditEvent(adminUserId, 'admin_update_user', 'user', id, data);
  }

  return User.findByPk(id, { attributes: { exclude: ['passwordHash'] } });
}
