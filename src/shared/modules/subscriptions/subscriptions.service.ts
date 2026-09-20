import { User } from '@database/models';
import * as repo from './subscriptions.repository';
import type { SubscriptionPlan, SubscriptionStatus, SubscriptionStore } from '@database/models';
import { AppError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';

export interface RevenueCatEvent {
  type: string;
  id: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id: string;
  entitlement_ids?: string[];
  period_type?: string;
  purchased_at_ms?: number;
  grace_period_expiration_at_ms?: number;
  expiration_at_ms?: number;
  store?: string;
  environment?: string;
  is_family_share?: boolean;
}

export interface RevenueCatWebhookPayload {
  api_version: string;
  event: RevenueCatEvent;
}

function resolvePlan(productId: string): SubscriptionPlan {
  const lower = productId.toLowerCase();
  if (lower.includes('lifetime')) return 'lifetime';
  if (lower.includes('yearly') || lower.includes('annual')) return 'yearly';
  return 'monthly';
}

function resolveStore(storeStr?: string): SubscriptionStore {
  if (!storeStr) return 'app_store';
  const lower = storeStr.toLowerCase();
  if (lower.includes('play')) return 'play_store';
  if (lower.includes('promo')) return 'promotional';
  return 'app_store';
}

function resolveStatus(eventType: string): SubscriptionStatus {
  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
      return 'active';
    case 'CANCELLATION':
      return 'cancelled';
    case 'EXPIRATION':
      return 'expired';
    case 'BILLING_ISSUE':
      return 'in_billing_retry';
    default:
      return 'active';
  }
}

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
  revenuecatAppUserId?: string | null;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayPaymentId?: string | null;
  /** True when this event represents a recurring renewal (fires the renewal notification). */
  isRenewalEvent?: boolean;
  /** Free-form label stored on the audit log only (e.g. RevenueCat's raw event type). */
  eventLabel: string;
}

/**
 * Single sync point shared by every payment provider: upserts the Subscription row and
 * keeps `User.role` consistent with it. Both RevenueCat (mobile) and Razorpay (web) events
 * flow through this function so a purchase on either platform is reflected identically for
 * both — this is what keeps mobile and web entitlement state in sync.
 */
export async function applySubscriptionState(input: SubscriptionStateInput) {
  const user = await User.findByPk(input.userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const entitlementId = input.entitlementId ?? 'pro';

  const subscription = await repo.upsertSubscription({
    userId: user.id,
    revenuecatAppUserId: input.revenuecatAppUserId ?? null,
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
    // Both RevenueCat and Razorpay retry undelivered webhooks — dedupe so a redelivered
    // renewal event doesn't send the customer a second "renewed" push for the same
    // real-world renewal.
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

export async function upsertFromWebhookEvent(payload: RevenueCatWebhookPayload) {
  const event = payload.event;
  if (!event) {
    throw new AppError(400, 'Invalid webhook payload: missing event', 'INVALID_WEBHOOK_PAYLOAD');
  }

  // RevenueCat app_user_id is our userId or email
  let user = await User.findByPk(event.app_user_id);
  if (!user && event.original_app_user_id) {
    user = await User.findByPk(event.original_app_user_id);
  }
  if (!user) {
    user = await User.findOne({ where: { email: event.app_user_id } });
  }

  if (!user) {
    console.warn(`[RevenueCat Webhook] User not found for app_user_id: ${event.app_user_id}`);
    return null;
  }

  const plan = resolvePlan(event.product_id);
  const status = resolveStatus(event.type);
  const store = resolveStore(event.store);
  const isLifetime = plan === 'lifetime';

  const currentPeriodStart = event.purchased_at_ms ? new Date(event.purchased_at_ms) : new Date();
  const currentPeriodEnd = isLifetime
    ? null
    : event.expiration_at_ms
      ? new Date(event.expiration_at_ms)
      : null;

  return applySubscriptionState({
    userId: user.id,
    revenuecatAppUserId: event.app_user_id,
    productId: event.product_id,
    entitlementId: event.entitlement_ids?.[0] || 'pro',
    status,
    plan,
    store,
    isLifetime,
    currentPeriodStart,
    currentPeriodEnd,
    originalPurchaseDate: event.purchased_at_ms ? new Date(event.purchased_at_ms) : null,
    unsubscribeDetectedAt: event.type === 'CANCELLATION' ? new Date() : null,
    billingIssuesDetectedAt: event.type === 'BILLING_ISSUE' ? new Date() : null,
    isRenewalEvent: event.type === 'RENEWAL',
    eventLabel: event.type,
  });
}

export async function listForAdmin(params: repo.ListSubscriptionsParams) {
  return repo.listSubscriptions(params);
}

export async function getRevenueAnalytics() {
  return repo.getRevenueMetrics();
}
