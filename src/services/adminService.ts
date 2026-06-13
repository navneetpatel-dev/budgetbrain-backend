import { Op, fn, col } from 'sequelize';
import { User, Subscription, AuditLog, Transaction, AiConversation } from '../models';

export async function getAdminDashboard() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalUsers, premiumUsers, activeSubscriptions, recentUsers, revenueEstimate, aiUsage] =
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
    ]);

  const planPricing: Record<string, number> = { monthly: 199, yearly: 1499 / 12, lifetime: 0 };
  let mrr = 0;
  for (const row of revenueEstimate as unknown as Array<{ plan: string; count: string }>) {
    mrr += (planPricing[row.plan] ?? 0) * Number(row.count);
  }

  return {
    totalUsers,
    premiumUsers,
    activeSubscriptions,
    newUsersLast30Days: recentUsers,
    estimatedMRR: Math.round(mrr),
    aiConversationsLast30Days: aiUsage,
    conversionRate: totalUsers > 0 ? Math.round((premiumUsers / totalUsers) * 100) : 0,
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
