import { Op } from 'sequelize';
import { Subscription, User, type SubscriptionAttributes } from '@database/models';
import { resolvePagination, paginatedResult } from '@shared/pagination';
import { PLAN_PRICES_INR } from './subscriptions.constants';

export interface ListSubscriptionsParams {
  page?: number;
  limit?: number;
  status?: string;
  plan?: string;
  search?: string;
}

export async function findActiveByUserId(userId: string, entitlementId = 'pro'): Promise<Subscription | null> {
  const now = new Date();
  return Subscription.findOne({
    where: {
      userId,
      entitlementId,
      [Op.or]: [
        { isLifetime: true },
        {
          status: { [Op.in]: ['active', 'in_grace_period'] },
          [Op.or]: [
            { currentPeriodEnd: null },
            { currentPeriodEnd: { [Op.gt]: now } },
          ],
        },
      ],
    },
  });
}

export async function findByUserId(userId: string): Promise<Subscription[]> {
  return Subscription.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
}

export async function findByRazorpaySubscriptionId(
  razorpaySubscriptionId: string
): Promise<Subscription | null> {
  return Subscription.findOne({
    where: { razorpaySubscriptionId },
  });
}

export async function upsertSubscription(
  data: Omit<SubscriptionAttributes, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Subscription> {
  const existing = await Subscription.findOne({
    where: {
      userId: data.userId,
      entitlementId: data.entitlementId,
    },
  });

  if (existing) {
    return existing.update(data);
  }

  return Subscription.create(data as any);
}

export async function listSubscriptions(params: ListSubscriptionsParams) {
  const { page, limit, offset } = resolvePagination(params.page, params.limit);
  const whereClause: Record<string, any> = {};

  if (params.status) {
    whereClause.status = params.status;
  }
  if (params.plan) {
    whereClause.plan = params.plan;
  }

  const userWhereClause: Record<string | symbol, any> = {};
  if (params.search) {
    userWhereClause[Op.or] = [
      { email: { [Op.iLike]: `%${params.search}%` } },
      { name: { [Op.iLike]: `%${params.search}%` } },
    ];
  }

  const { rows, count } = await Subscription.findAndCountAll({
    where: whereClause,
    include: [

      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'name', 'avatarUrl', 'role'],
        where: Object.keys(userWhereClause).length > 0 ? userWhereClause : undefined,
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return paginatedResult('subscriptions', rows, count, page, limit);
}

export async function getRevenueMetrics() {
  const allSubscriptions = await Subscription.findAll();

  let activeCount = 0;
  let monthlyCount = 0;
  let yearlyCount = 0;
  let lifetimeCount = 0;
  let cancelledCount = 0;
  let expiredCount = 0;

  for (const sub of allSubscriptions) {
    if (sub.isLifetime) {
      lifetimeCount++;
      activeCount++;
    } else if (sub.status === 'active' || sub.status === 'in_grace_period') {
      activeCount++;
      if (sub.plan === 'monthly') monthlyCount++;
      if (sub.plan === 'yearly') yearlyCount++;
    } else if (sub.status === 'cancelled') {
      cancelledCount++;
    } else if (sub.status === 'expired') {
      expiredCount++;
    }
  }

  // MRR: monthly * 199 + (yearly * 1499) / 12
  const monthlyRevenue = monthlyCount * PLAN_PRICES_INR.monthly;
  const yearlyRevenueMonthlyProrated = Math.round((yearlyCount * PLAN_PRICES_INR.yearly) / 12);
  const mrr = monthlyRevenue + yearlyRevenueMonthlyProrated;
  const arr = mrr * 12;

  // Total gross estimated volume
  const totalRevenue =
    monthlyCount * PLAN_PRICES_INR.monthly +
    yearlyCount * PLAN_PRICES_INR.yearly +
    lifetimeCount * PLAN_PRICES_INR.lifetime;

  // Churn rate: cancelled / (active + cancelled)
  const totalTracked = activeCount + cancelledCount;
  const churnRate = totalTracked > 0 ? Number(((cancelledCount / totalTracked) * 100).toFixed(1)) : 0;

  return {
    mrr,
    arr,
    totalRevenue,
    activeSubscriptions: activeCount,
    churnRate,
    breakdown: {
      monthly: monthlyCount,
      yearly: yearlyCount,
      lifetime: lifetimeCount,
      cancelled: cancelledCount,
      expired: expiredCount,
    },
    pricing: PLAN_PRICES_INR,
  };
}
