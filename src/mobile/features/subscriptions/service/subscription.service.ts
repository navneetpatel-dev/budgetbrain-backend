import { User, Subscription, sequelize } from '../../../../shared/models';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';

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

  await sequelize.transaction(async (t) => {
    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!user) return;

    const productId = event.event?.product_id ?? '';
    const plan = detectPlan(productId);
    const revenueCatId = event.event?.original_transaction_id ?? event.event?.id ?? userId;
    const eventType = event.event?.type ?? '';

    const isActive = ['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE'].includes(eventType);

    if (isActive) {
      const beforeRole = user.role;
      await Subscription.update(
        { status: 'expired' },
        { where: { userId, status: 'active' }, transaction: t }
      );

      const subscription = await Subscription.create(
        {
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
        },
        { transaction: t }
      );

      const newRole = plan === 'lifetime' ? 'lifetime' : 'premium';
      await user.update({ role: newRole }, { transaction: t });

      await writeAuditLog({
        action: AuditAction.SUBSCRIPTION_ACTIVATE,
        resource: AuditResource.SUBSCRIPTION,
        resourceId: subscription.id,
        actorUserId: userId,
        actorType: 'system',
        source: 'system',
        beforeState: { role: beforeRole },
        afterState: { role: newRole, plan, eventType },
        severity: 'info',
        transaction: t,
      });
    } else if (eventType === 'EXPIRATION') {
      const beforeRole = user.role;
      await Subscription.update(
        { status: 'expired' },
        { where: { userId, status: 'active' }, transaction: t }
      );
      await user.update({ role: 'free' }, { transaction: t });

      await writeAuditLog({
        action: AuditAction.SUBSCRIPTION_EXPIRE,
        resource: AuditResource.SUBSCRIPTION,
        actorUserId: userId,
        actorType: 'system',
        source: 'system',
        beforeState: { role: beforeRole },
        afterState: { role: 'free', eventType },
        severity: 'warning',
        transaction: t,
      });
    }
  });
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
  return sequelize.transaction(async (t) => {
    let subscription = await Subscription.findOne({
      where: { userId, status: 'active' },
      order: [['createdAt', 'DESC']],
      transaction: t,
    });

    if (!subscription && revenueCatId) {
      subscription = await Subscription.findOne({
        where: { revenueCatId, status: 'active' },
        transaction: t,
      });
    }

    const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
    if (subscription && user) {
      const beforeRole = user.role;
      const newRole = subscription.plan === 'lifetime' ? 'lifetime' : 'premium';
      await user.update({ role: newRole }, { transaction: t });
      if (revenueCatId && !subscription.revenueCatId) {
        await subscription.update({ revenueCatId }, { transaction: t });
      }

      await writeAuditLog({
        action: AuditAction.SUBSCRIPTION_RESTORE,
        resource: AuditResource.SUBSCRIPTION,
        resourceId: subscription.id,
        actorUserId: userId,
        beforeState: { role: beforeRole },
        afterState: { role: newRole },
        transaction: t,
      });
    }

    return {
      restored: !!subscription,
      role: user?.role ?? 'free',
    };
  });
}
