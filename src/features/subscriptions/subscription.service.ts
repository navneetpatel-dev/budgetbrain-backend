import { User, Subscription } from '../../models';

interface RevenueCatEvent {
  event?: {
    type?: string;
    app_user_id?: string;
    product_id?: string;
    expiration_at_ms?: number;
    original_transaction_id?: string;
    id?: string;
  };
}

const PLAN_PRICING = {
  monthly: { price: 199, currency: 'INR', period: 'month' },
  yearly: { price: 1499, currency: 'INR', period: 'year' },
  lifetime: { price: 3999, currency: 'INR', period: 'once' },
} as const;

function detectPlan(productId: string): 'monthly' | 'yearly' | 'lifetime' {
  if (productId.includes('lifetime')) return 'lifetime';
  if (productId.includes('yearly')) return 'yearly';
  return 'monthly';
}

export async function handleWebhook(event: RevenueCatEvent): Promise<void> {
  const userId = event.event?.app_user_id;
  if (!userId) return;

  const user = await User.findByPk(userId);
  if (!user) return;

  const productId = event.event?.product_id ?? '';
  const plan = detectPlan(productId);

  const revenueCatId = event.event?.original_transaction_id ?? event.event?.id ?? userId;

  const isActive = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE'].includes(
    event.event?.type ?? ''
  );

  if (isActive) {
    await Subscription.update({ status: 'expired' }, { where: { userId, status: 'active' } });

    await Subscription.create({
      userId,
      plan,
      status: 'active',
      revenueCatId,
      expiresAt: event.event?.expiration_at_ms
        ? new Date(event.event.expiration_at_ms)
        : plan === 'lifetime'
          ? null
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      purchasedAt: new Date(),
    });

    await user.update({ role: plan === 'lifetime' ? 'lifetime' : 'premium' });
  } else if (event.event?.type === 'EXPIRATION') {
    await Subscription.update({ status: 'expired' }, { where: { userId, status: 'active' } });
    await user.update({ role: 'free' });
  }
}

export async function getSubscriptionStatus(userId: string, role: string) {
  const subscription = await Subscription.findOne({
    where: { userId, status: 'active' },
    order: [['createdAt', 'DESC']],
  });

  return {
    role,
    subscription,
    plans: PLAN_PRICING,
  };
}

export async function restoreSubscription(userId: string, revenueCatId?: string) {
  let subscription = await Subscription.findOne({
    where: { userId, status: 'active' },
    order: [['createdAt', 'DESC']],
  });

  if (!subscription && revenueCatId) {
    subscription = await Subscription.findOne({
      where: { revenueCatId, status: 'active' },
    });
  }

  const user = await User.findByPk(userId);
  if (subscription && user) {
    await user.update({
      role: subscription.plan === 'lifetime' ? 'lifetime' : 'premium',
    });
    if (revenueCatId && !subscription.revenueCatId) {
      await subscription.update({ revenueCatId });
    }
  }

  return {
    restored: !!subscription,
    role: user?.role ?? 'free',
  };
}
