import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '@config/env';
import { AppError } from '@shared/errors';
import { PLAN_PRICES_INR } from './subscriptions.constants';
import { applySubscriptionState } from './subscriptions.service';
import * as repo from './subscriptions.repository';
import type { SubscriptionPlan, SubscriptionStatus } from '@database/models';

function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

let client: Razorpay | null = null;
function getClient(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new AppError(503, 'Razorpay is not configured', 'RAZORPAY_NOT_CONFIGURED');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID!, key_secret: env.RAZORPAY_KEY_SECRET! });
  }
  return client;
}

export interface CheckoutOrderResult {
  keyId: string;
  currency: 'INR';
  plan: SubscriptionPlan;
  amount: number; // paise
  /** Present for the one-time `lifetime` plan — pass to Checkout.js as `order_id`. */
  orderId?: string;
  /** Present for recurring `monthly`/`yearly` plans — pass to Checkout.js as `subscription_id`. */
  subscriptionId?: string;
}

/**
 * Creates a Razorpay Order (one-time, `lifetime`) or Subscription (recurring,
 * `monthly`/`yearly`) for the given user. The amount is ALWAYS resolved server-side from
 * `PLAN_PRICES_INR` — never accept a client-supplied amount here, that would let a caller
 * pay whatever they choose for a "premium" entitlement.
 */
export async function createCheckoutOrder(userId: string, plan: SubscriptionPlan): Promise<CheckoutOrderResult> {
  const razorpay = getClient();

  if (plan === 'lifetime') {
    const amount = PLAN_PRICES_INR.lifetime * 100;
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      notes: { userId, plan },
    });
    return { keyId: env.RAZORPAY_KEY_ID!, currency: 'INR', plan, amount, orderId: order.id };
  }

  const planId = plan === 'yearly' ? env.RAZORPAY_PLAN_ID_YEARLY : env.RAZORPAY_PLAN_ID_MONTHLY;
  if (!planId) {
    throw new AppError(
      503,
      `Razorpay plan id for "${plan}" is not configured`,
      'RAZORPAY_PLAN_NOT_CONFIGURED'
    );
  }

  const amount = (plan === 'yearly' ? PLAN_PRICES_INR.yearly : PLAN_PRICES_INR.monthly) * 100;
  const subscription = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: plan === 'yearly' ? 5 : 60, // years/months of billing cycles before Razorpay requires renewal of the mandate
    notes: { userId, plan },
  });

  return {
    keyId: env.RAZORPAY_KEY_ID!,
    currency: 'INR',
    plan,
    amount,
    subscriptionId: subscription.id,
  };
}

/** Timing-safe HMAC-SHA256 verification of a Razorpay webhook payload against its raw bytes. */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

interface RazorpayNotes {
  userId?: string;
  plan?: SubscriptionPlan;
}

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity?: { id: string; order_id?: string; subscription_id?: string; notes?: RazorpayNotes };
    };
    order?: { entity?: { id: string; notes?: RazorpayNotes } };
    subscription?: {
      entity?: {
        id: string;
        plan_id?: string;
        status?: string;
        current_start?: number;
        current_end?: number;
        notes?: RazorpayNotes;
      };
    };
  };
}

function resolvePlanFromNotesOrPlanId(notes: RazorpayNotes | undefined, planId?: string): SubscriptionPlan {
  if (notes?.plan) return notes.plan;
  if (planId && planId === env.RAZORPAY_PLAN_ID_YEARLY) return 'yearly';
  if (planId && planId === env.RAZORPAY_PLAN_ID_MONTHLY) return 'monthly';
  return 'monthly';
}

/**
 * Applies a verified Razorpay webhook event via the shared `applySubscriptionState` sync
 * point, so `User.role` (and therefore entitlement on mobile AND web) is updated the same
 * way regardless of which webhook event triggered it.
 */
export async function upsertFromRazorpayEvent(payload: RazorpayWebhookPayload) {
  const { event } = payload;

  switch (event) {
    case 'payment.captured': {
      const entity = payload.payload.payment?.entity;
      if (!entity) {
        console.warn('[Razorpay Webhook] payment.captured missing payment entity');
        return null;
      }

      // Recurring-subscription charges also fire payment.captured alongside
      // subscription.charged — the latter is the authoritative renewal handler (notes
      // are reliably present on the subscription entity there). Skip here to avoid
      // double-processing AND ever having to guess a plan for an event that isn't the
      // source of truth for subscription renewals.
      if (entity.subscription_id) {
        console.warn(
          '[Razorpay Webhook] payment.captured for a subscription charge — deferring to subscription.charged',
          { paymentId: entity.id, subscriptionId: entity.subscription_id }
        );
        return null;
      }

      const notes = entity.notes ?? payload.payload.order?.entity?.notes;
      const userId = notes?.userId;
      if (!userId) {
        console.warn('[Razorpay Webhook] payment.captured missing userId in notes');
        return null;
      }

      let plan = notes?.plan;
      if (!plan && entity.order_id) {
        // Fall back to the order's own notes, set at creation time by createCheckoutOrder.
        try {
          const order = await getClient().orders.fetch(entity.order_id);
          plan = (order.notes as RazorpayNotes | undefined)?.plan;
        } catch (err) {
          console.warn('[Razorpay Webhook] failed to fetch order for plan lookup', {
            orderId: entity.order_id,
            err,
          });
        }
      }

      if (!plan) {
        // Never assume the highest-privilege plan for an ambiguous event.
        console.warn('[Razorpay Webhook] payment.captured: could not resolve plan, refusing to guess', {
          paymentId: entity.id,
        });
        return null;
      }

      const isLifetime = plan === 'lifetime';
      const now = new Date();
      return applySubscriptionState({
        userId,
        productId: `razorpay_${plan}`,
        status: 'active',
        plan,
        store: 'razorpay',
        isLifetime,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        originalPurchaseDate: now,
        razorpayOrderId: entity.order_id ?? payload.payload.order?.entity?.id ?? null,
        razorpayPaymentId: entity.id,
        eventLabel: event,
      });
    }

    case 'subscription.activated':
    case 'subscription.charged': {
      const entity = payload.payload.subscription?.entity;
      const paymentEntity = payload.payload.payment?.entity;
      const notes = entity?.notes ?? paymentEntity?.notes;
      const userId = notes?.userId;
      if (!userId || !entity) {
        console.warn(`[Razorpay Webhook] ${event} missing userId in notes`);
        return null;
      }
      const plan = resolvePlanFromNotesOrPlanId(notes, entity.plan_id);
      const status: SubscriptionStatus = 'active';
      return applySubscriptionState({
        userId,
        productId: `razorpay_${plan}`,
        status,
        plan,
        store: 'razorpay',
        isLifetime: false,
        currentPeriodStart: entity.current_start ? new Date(entity.current_start * 1000) : new Date(),
        currentPeriodEnd: entity.current_end ? new Date(entity.current_end * 1000) : null,
        originalPurchaseDate: entity.current_start ? new Date(entity.current_start * 1000) : new Date(),
        razorpaySubscriptionId: entity.id,
        razorpayPaymentId: paymentEntity?.id ?? null,
        isRenewalEvent: event === 'subscription.charged',
        eventLabel: event,
      });
    }

    case 'subscription.cancelled':
    case 'subscription.completed': {
      const entity = payload.payload.subscription?.entity;
      const notes = entity?.notes;
      const userId = notes?.userId;
      if (!userId || !entity) {
        console.warn(`[Razorpay Webhook] ${event} missing userId in notes`);
        return null;
      }
      const plan = resolvePlanFromNotesOrPlanId(notes, entity.plan_id);
      const status: SubscriptionStatus = event === 'subscription.completed' ? 'expired' : 'cancelled';
      return applySubscriptionState({
        userId,
        productId: `razorpay_${plan}`,
        status,
        plan,
        store: 'razorpay',
        isLifetime: false,
        currentPeriodStart: entity.current_start ? new Date(entity.current_start * 1000) : null,
        currentPeriodEnd: entity.current_end ? new Date(entity.current_end * 1000) : null,
        originalPurchaseDate: null,
        razorpaySubscriptionId: entity.id,
        unsubscribeDetectedAt: event === 'subscription.cancelled' ? new Date() : null,
        eventLabel: event,
      });
    }

    case 'payment.failed': {
      // A single failed charge attempt (e.g. a renewal retry) — Razorpay itself retries
      // and eventually fires subscription.cancelled/halted on terminal failure, which is
      // handled above. Don't downgrade entitlement on a single failure; just make it
      // visible in admin monitoring via the 'in_billing_retry' status.
      const entity = payload.payload.payment?.entity;
      const subscriptionId = entity?.subscription_id;
      if (!subscriptionId) {
        // A one-time (lifetime) order payment failure — no existing subscription state
        // to mark as at-risk.
        console.warn('[Razorpay Webhook] payment.failed (one-time order)', { paymentId: entity?.id });
        return null;
      }

      const existing = await repo.findByRazorpaySubscriptionId(subscriptionId);
      if (!existing) {
        console.warn('[Razorpay Webhook] payment.failed for unknown subscription', { subscriptionId });
        return null;
      }

      return applySubscriptionState({
        userId: existing.userId,
        entitlementId: existing.entitlementId,
        productId: existing.productId,
        status: 'in_billing_retry',
        plan: existing.plan,
        store: existing.store,
        isLifetime: existing.isLifetime,
        currentPeriodStart: existing.currentPeriodStart,
        currentPeriodEnd: existing.currentPeriodEnd,
        originalPurchaseDate: existing.originalPurchaseDate,
        razorpaySubscriptionId: existing.razorpaySubscriptionId,
        razorpayOrderId: existing.razorpayOrderId,
        razorpayPaymentId: entity?.id ?? existing.razorpayPaymentId,
        billingIssuesDetectedAt: new Date(),
        eventLabel: event,
      });
    }

    default:
      console.warn(`[Razorpay Webhook] Unhandled event type: ${event}`);
      return null;
  }
}
