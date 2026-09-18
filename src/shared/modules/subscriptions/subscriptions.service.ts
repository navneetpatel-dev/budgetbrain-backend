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
  if (lower.includes('stripe')) return 'stripe';
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

  const entitlementId = event.entitlement_ids?.[0] || 'pro';
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

  const subscription = await repo.upsertSubscription({
    userId: user.id,
    revenuecatAppUserId: event.app_user_id,
    productId: event.product_id,
    entitlementId,
    status,
    plan,
    store,
    isLifetime,
    currentPeriodStart,
    currentPeriodEnd,
    originalPurchaseDate: event.purchased_at_ms ? new Date(event.purchased_at_ms) : null,
    unsubscribeDetectedAt: event.type === 'CANCELLATION' ? new Date() : null,
    billingIssuesDetectedAt: event.type === 'BILLING_ISSUE' ? new Date() : null,
  });

  // Keep User.role in sync: if active and lifetime -> 'lifetime', active -> 'premium', expired -> 'free'
  let updatedRole = user.role;
  if (user.role !== 'admin') {
    if (isLifetime) {
      updatedRole = 'lifetime';

    } else if (status === 'active' || status === 'in_grace_period') {
      updatedRole = 'premium';
    } else if (status === 'expired' || status === 'cancelled') {
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
      eventType: event.type,
      productId: event.product_id,
      status,
      plan,
      newRole: updatedRole,
    },
  });

  if (event.type === 'RENEWAL') {
    const { createNotification } = await import('@shared/modules/notifications/service/notification.service');
    await createNotification(
      user.id,
      'subscription_renewal',
      'Subscription renewed',
      `Your BudgetBrain ${plan} subscription has been renewed.`,
      { subscriptionId: subscription.id, plan }
    );
  }

  return subscription;
}

export async function listForAdmin(params: repo.ListSubscriptionsParams) {
  return repo.listSubscriptions(params);
}

export async function getRevenueAnalytics() {
  return repo.getRevenueMetrics();
}
