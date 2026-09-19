import Stripe from 'stripe';
import { env } from '@config/env';
import { AppError } from '@shared/errors';
import { applySubscriptionState } from './subscriptions.service';
import * as repo from './subscriptions.repository';
import { User } from '@database/models';
import type { SubscriptionPlan, SubscriptionStatus } from '@database/models';

function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

let client: Stripe | null = null;
function getClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new AppError(503, 'Stripe is not configured', 'STRIPE_NOT_CONFIGURED');
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY!);
  }
  return client;
}

function priceIdForPlan(plan: SubscriptionPlan): string {
  const priceId =
    plan === 'lifetime'
      ? env.STRIPE_PRICE_ID_LIFETIME
      : plan === 'yearly'
        ? env.STRIPE_PRICE_ID_YEARLY
        : env.STRIPE_PRICE_ID_MONTHLY;
  if (!priceId) {
    throw new AppError(503, `Stripe price id for "${plan}" is not configured`, 'STRIPE_PRICE_NOT_CONFIGURED');
  }
  return priceId;
}

export interface StripeCheckoutResult {
  url: string;
}

/**
 * Creates a Stripe Checkout Session (hosted, redirect-based — mirrors Razorpay's
 * hosted-order/subscription pattern rather than an embedded card form). The price charged
 * is ALWAYS resolved server-side from a pre-created Stripe Price id — never accept a
 * client-supplied amount here, that would let a caller pay whatever they choose for a
 * "premium" entitlement.
 */
export async function createCheckoutSession(userId: string, plan: SubscriptionPlan): Promise<StripeCheckoutResult> {
  const stripe = getClient();
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
  }

  const priceId = priceIdForPlan(plan);
  const isLifetime = plan === 'lifetime';

  // Reuse an existing Stripe customer for this user if one already exists (from a prior
  // checkout attempt or subscription), so repeated checkouts don't fragment billing history.
  const existing = await repo.findByUserId(userId);
  const existingCustomerId = existing.find((s) => s.stripeCustomerId)?.stripeCustomerId ?? undefined;

  const session = await stripe.checkout.sessions.create({
    mode: isLifetime ? 'payment' : 'subscription',
    customer: existingCustomerId,
    customer_email: existingCustomerId ? undefined : user.email,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId, plan },
    subscription_data: isLifetime ? undefined : { metadata: { userId, plan } },
    success_url: `${env.APP_URL}/upgrade?provider=stripe&status=success`,
    cancel_url: `${env.APP_URL}/upgrade?provider=stripe&status=cancelled`,
  });

  if (!session.url) {
    throw new AppError(502, 'Stripe did not return a checkout URL', 'STRIPE_CHECKOUT_FAILED');
  }

  return { url: session.url };
}

/** Verifies a Stripe webhook payload against its raw bytes using Stripe's own SDK helper. */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): Stripe.Event | null {
  if (!env.STRIPE_WEBHOOK_SECRET || !signatureHeader) return null;
  try {
    return getClient().webhooks.constructEvent(rawBody, signatureHeader, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('[Stripe Webhook] signature verification failed', err);
    return null;
  }
}

function resolvePlanFromMetadataOrPriceId(
  metadata: Stripe.Metadata | null | undefined,
  priceId?: string | null
): SubscriptionPlan {
  const fromMetadata = metadata?.plan as SubscriptionPlan | undefined;
  if (fromMetadata) return fromMetadata;
  if (priceId && priceId === env.STRIPE_PRICE_ID_YEARLY) return 'yearly';
  if (priceId && priceId === env.STRIPE_PRICE_ID_LIFETIME) return 'lifetime';
  return 'monthly';
}

/**
 * Applies a verified Stripe webhook event via the same `applySubscriptionState` sync point
 * RevenueCat and Razorpay use — no changes were needed to that function to support this
 * third provider, confirming it's genuinely provider-agnostic.
 */
export async function upsertFromStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      if (!userId) {
        console.warn('[Stripe Webhook] checkout.session.completed missing client_reference_id/userId');
        return null;
      }

      const plan = resolvePlanFromMetadataOrPriceId(session.metadata);
      const isLifetime = plan === 'lifetime';
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;
      const now = new Date();

      return applySubscriptionState({
        userId,
        productId: `stripe_${plan}`,
        status: 'active',
        plan,
        store: 'stripe',
        isLifetime,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        originalPurchaseDate: now,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        eventLabel: event.type,
      });
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      // Stripe API 2025+ moved the subscription reference off Invoice directly and onto
      // `parent.subscription_details.subscription` (a string id).
      const subscriptionId = invoice.parent?.subscription_details?.subscription;
      const resolvedSubscriptionId =
        typeof subscriptionId === 'string' ? subscriptionId : subscriptionId?.id;
      if (!resolvedSubscriptionId) {
        // A one-time (lifetime) payment's invoice — checkout.session.completed already
        // handled granting access; nothing further to sync here.
        return null;
      }

      const existing = await repo.findByStripeSubscriptionId(resolvedSubscriptionId);
      const line = invoice.lines?.data?.[0];
      // Line items reference their Price via `pricing.price_details.price` (string id),
      // replacing the old direct `line.price` field in this API version.
      const linePriceId = line?.pricing?.price_details?.price;
      const plan = resolvePlanFromMetadataOrPriceId(
        (line?.metadata as Stripe.Metadata | undefined) ?? existing?.entitlementId ? {} : undefined,
        typeof linePriceId === 'string' ? linePriceId : undefined
      );
      const userId = existing?.userId ?? (invoice.metadata?.userId as string | undefined);
      if (!userId) {
        console.warn('[Stripe Webhook] invoice.paid: could not resolve userId', { subscriptionId: resolvedSubscriptionId });
        return null;
      }

      const periodEnd = line?.period?.end ? new Date(line.period.end * 1000) : existing?.currentPeriodEnd ?? null;
      const periodStart = line?.period?.start
        ? new Date(line.period.start * 1000)
        : existing?.currentPeriodStart ?? new Date();

      return applySubscriptionState({
        userId,
        productId: `stripe_${plan}`,
        status: 'active',
        plan: existing?.plan ?? plan,
        store: 'stripe',
        isLifetime: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        originalPurchaseDate: existing?.originalPurchaseDate ?? periodStart,
        stripeCustomerId:
          (typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id) ??
          existing?.stripeCustomerId,
        stripeSubscriptionId: resolvedSubscriptionId,
        isRenewalEvent: true,
        eventLabel: event.type,
      });
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const rawSubscriptionId = invoice.parent?.subscription_details?.subscription;
      const subscriptionId =
        typeof rawSubscriptionId === 'string' ? rawSubscriptionId : rawSubscriptionId?.id;
      if (!subscriptionId) return null;

      const existing = await repo.findByStripeSubscriptionId(subscriptionId);
      if (!existing) {
        console.warn('[Stripe Webhook] invoice.payment_failed for unknown subscription', { subscriptionId });
        return null;
      }

      // Mirror RevenueCat's BILLING_ISSUE / Razorpay's payment.failed handling: don't
      // downgrade access on a single failed attempt, just make it visible.
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
        stripeCustomerId: existing.stripeCustomerId,
        stripeSubscriptionId: existing.stripeSubscriptionId,
        billingIssuesDetectedAt: new Date(),
        eventLabel: event.type,
      });
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const existing = await repo.findByStripeSubscriptionId(subscription.id);
      const userId = existing?.userId ?? (subscription.metadata?.userId as string | undefined);
      if (!userId) {
        console.warn('[Stripe Webhook] customer.subscription.deleted: could not resolve userId', {
          subscriptionId: subscription.id,
        });
        return null;
      }

      const plan = existing?.plan ?? resolvePlanFromMetadataOrPriceId(subscription.metadata);
      const status: SubscriptionStatus = 'cancelled';

      return applySubscriptionState({
        userId,
        productId: existing?.productId ?? `stripe_${plan}`,
        status,
        plan,
        store: 'stripe',
        isLifetime: false,
        currentPeriodStart: existing?.currentPeriodStart ?? null,
        currentPeriodEnd: existing?.currentPeriodEnd ?? null,
        originalPurchaseDate: existing?.originalPurchaseDate ?? null,
        stripeCustomerId: existing?.stripeCustomerId ?? null,
        stripeSubscriptionId: subscription.id,
        unsubscribeDetectedAt: new Date(),
        eventLabel: event.type,
      });
    }

    default:
      console.warn(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      return null;
  }
}
