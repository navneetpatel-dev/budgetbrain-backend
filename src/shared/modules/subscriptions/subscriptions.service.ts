import { User } from '@database/models';
import * as repo from './subscriptions.repository';
import type { SubscriptionPlan, SubscriptionStatus, SubscriptionStore } from '@database/models';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';

export async function getEntitlementForUser(userId: string, entitlementId = 'pro') {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  // Admin and lifetime users are always entitled
  if (user.role === 'admin' || user.role === 'lifetime') {
    return {
      isEntitled: true,
      plan: (user.role === 'lifetime' ? 'lifetime' : 'monthly') as SubscriptionPlan,
      status: 'active' as SubscriptionStatus,
      isLifetime: user.role === 'lifetime',
      expiresAt: null,
    };
  }

  const subscription = await repo.findActiveByUserId(userId, entitlementId);

  if (!subscription) {
    return {
      isEntitled: false,
      plan: null,
      status: null,
      isLifetime: false,
      expiresAt: null,
    };
  }

  return {
    isEntitled: true,
    plan: subscription.plan,
    status: subscription.status,
    isLifetime: subscription.isLifetime,
    expiresAt: subscription.currentPeriodEnd,
  };
}

export interface SubscriptionStateInput {
  userId: string;
  productId: string;
  entitlementId?: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  store: SubscriptionStore;
  isLifetime: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  originalPurchaseDate: Date | null;
  unsubscribeDetectedAt?: Date | null;
  billingIssuesDetectedAt?: Date | null;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayPaymentId?: string | null;
  /** True when this event represents a recurring renewal (fires the renewal notification). */
  isRenewalEvent?: boolean;
  /** Free-form label stored on the audit log only (e.g. the webhook's raw event type). */
  eventLabel: string;
}

/**
 * Single sync point for every subscription-state change (Razorpay webhook events, or an
 * admin/promotional grant): upserts the Subscription row and keeps `User.role` consistent
 * with it — this is what keeps mobile and web entitlement reads (both driven by `User.role`)
 * in sync with each other regardless of which route the change came from.
 */
export async function applySubscriptionState(input: SubscriptionStateInput) {
  const user = await User.findByPk(input.userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const entitlementId = input.entitlementId ?? 'pro';

  const subscription = await repo.upsertSubscription({
    userId: user.id,
    productId: input.productId,
    entitlementId,
    status: input.status,
    plan: input.plan,
    store: input.store,
    isLifetime: input.isLifetime,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    originalPurchaseDate: input.originalPurchaseDate,
    unsubscribeDetectedAt: input.unsubscribeDetectedAt ?? null,
    billingIssuesDetectedAt: input.billingIssuesDetectedAt ?? null,
    razorpayOrderId: input.razorpayOrderId ?? null,
    razorpaySubscriptionId: input.razorpaySubscriptionId ?? null,
    razorpayPaymentId: input.razorpayPaymentId ?? null,
  });

  // Keep User.role in sync: if active and lifetime -> 'lifetime', active -> 'premium', expired -> 'free'
  let updatedRole = user.role;
  if (user.role !== 'admin') {
    if (input.isLifetime) {
      updatedRole = 'lifetime';
    } else if (input.status === 'active' || input.status === 'in_grace_period') {
      updatedRole = 'premium';
    } else if (input.status === 'expired' || input.status === 'cancelled') {
      updatedRole = 'free';
    }

    if (updatedRole !== user.role) {
      await user.update({ role: updatedRole });
    }
  }

  await writeAuditLog({
    action: AuditAction.USER_ROLE_CHANGE,
    resource: AuditResource.USER,
    resourceId: user.id,
    actorUserId: user.id,
    metadata: {
      eventType: input.eventLabel,
      productId: input.productId,
      store: input.store,
      status: input.status,
      plan: input.plan,
      newRole: updatedRole,
    },
  });

  if (input.isRenewalEvent) {
    // Razorpay retries undelivered webhooks — dedupe so a redelivered renewal event doesn't
    // send the customer a second "renewed" push for the same real-world renewal.
    const { Notification } = await import('@database/models');
    const { Op } = await import('sequelize');
    const recentWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRenewals = await Notification.findAll({
      where: {
        userId: user.id,
        type: 'subscription_renewal',
        createdAt: { [Op.gte]: recentWindowStart },
      },
    });
    const alreadyNotified = recentRenewals.some(
      (n) => (n.data as { subscriptionId?: string } | null)?.subscriptionId === subscription.id
    );

    if (!alreadyNotified) {
      const { createNotification } = await import('@shared/modules/notifications/service/notification.service');
      await createNotification(
        user.id,
        'subscription_renewal',
        'Subscription renewed',
        `Your BudgetBrain ${input.plan} subscription has been renewed.`,
        { subscriptionId: subscription.id, plan: input.plan }
      );
    }
  }

  return subscription;
}

export async function listForAdmin(params: repo.ListSubscriptionsParams) {
  return repo.listSubscriptions(params);
}

export async function getRevenueAnalytics() {
  return repo.getRevenueMetrics();
}
