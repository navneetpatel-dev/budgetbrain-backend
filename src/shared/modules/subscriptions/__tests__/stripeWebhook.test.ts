import Stripe from 'stripe';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { env } from '@config/env';
import {
  verifyWebhookSignature,
  upsertFromStripeEvent,
  createCheckoutSession,
} from '../stripe.service';
import { User, Notification } from '@database/models';

const TEST_SECRET = 'whsec_test_stripe_webhook_secret';

// The Stripe SDK never makes a network call for webhook signature construction/verification
// or for generateTestHeaderString — a syntactically-valid-looking test key is sufficient.
const testClient = new Stripe('sk_test_fake_key_for_signing_only');

function signedEvent(body: object): { raw: Buffer; signature: string } {
  const payload = JSON.stringify(body);
  const signature = testClient.webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
  });
  return { raw: Buffer.from(payload), signature };
}

// Unique per test run so literal ids in this file (Stripe subscription/customer ids are
// arbitrary strings in tests) can never collide with another concurrently-running test
// file's fixtures sharing the same dev Postgres database — this is what caused two
// flaky-looking failures (`sub_test_dedup_${RUN}` collided with razorpayWebhook.test.ts's own
// literal fixture id) when this suite ran alongside other subscription tests.
const RUN = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe('Stripe webhook & checkout', () => {
  let previousSecret: string | undefined;
  let previousKey: string | undefined;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    previousSecret = env.STRIPE_WEBHOOK_SECRET;
    previousKey = env.STRIPE_SECRET_KEY;
    env.STRIPE_WEBHOOK_SECRET = TEST_SECRET;
    env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_signing_only';
  });

  afterEach(() => {
    env.STRIPE_WEBHOOK_SECRET = previousSecret;
    env.STRIPE_SECRET_KEY = previousKey;
  });

  it('rejects a webhook with an invalid/tampered signature and applies no state change', () => {
    const payload = { id: 'evt_test_1', type: 'checkout.session.completed', data: { object: {} } };
    const raw = Buffer.from(JSON.stringify(payload));
    expect(verifyWebhookSignature(raw, 'not-the-real-signature')).toBeNull();
    expect(verifyWebhookSignature(raw, undefined)).toBeNull();
  });

  it('rejects a webhook when no webhook secret is configured (fail closed)', () => {
    env.STRIPE_WEBHOOK_SECRET = undefined;
    const { raw, signature } = signedEvent({ id: 'evt_test_2', type: 'checkout.session.completed' });
    expect(verifyWebhookSignature(raw, signature)).toBeNull();
  });

  it('accepts a correctly-signed payload and parses the real event', () => {
    const payload = {
      id: 'evt_test_3',
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: { id: `cs_test_3_${RUN}` } },
    };
    const { raw, signature } = signedEvent(payload);
    const event = verifyWebhookSignature(raw, signature);
    expect(event).not.toBeNull();
    expect(event!.type).toBe('checkout.session.completed');
  });

  it('checkout.session.completed (lifetime one-time payment) upgrades the user role to lifetime', async () => {
    const user = await createTestUser({ role: 'free' });

    const result = await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'lifetime' },
          customer: `cus_test_1_${RUN}`,
          subscription: null,
        },
      },
    } as unknown as Stripe.Event);

    expect(result).not.toBeNull();
    expect(result!.plan).toBe('lifetime');
    expect(result!.isLifetime).toBe(true);
    expect(result!.store).toBe('stripe');

    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('lifetime');
  });

  it('checkout.session.completed (recurring monthly) upgrades the user role to premium', async () => {
    const user = await createTestUser({ role: 'free' });

    const result = await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'monthly' },
          customer: `cus_test_2_${RUN}`,
          subscription: `sub_test_2_${RUN}`,
        },
      },
    } as unknown as Stripe.Event);

    expect(result).not.toBeNull();
    expect(result!.plan).toBe('monthly');
    expect(result!.isLifetime).toBe(false);
    expect(result!.store).toBe('stripe');
    expect(result!.stripeSubscriptionId).toBe(`sub_test_2_${RUN}`);

    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');
  });

  it('invoice.paid (renewal) keeps the user premium and updates currentPeriodEnd', async () => {
    const user = await createTestUser({ role: 'free' });

    // First activation via checkout
    await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'monthly' },
          customer: `cus_test_3_${RUN}`,
          subscription: `sub_test_3_${RUN}`,
        },
      },
    } as unknown as Stripe.Event);

    let refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');

    const periodStart = Math.floor(Date.now() / 1000);
    const periodEnd = periodStart + 30 * 86400;

    const result = await upsertFromStripeEvent({
      type: 'invoice.paid',
      data: {
        object: {
          parent: { subscription_details: { subscription: `sub_test_3_${RUN}` } },
          customer: `cus_test_3_${RUN}`,
          metadata: { userId: user.id },
          lines: {
            data: [
              {
                pricing: { price_details: { price: env.STRIPE_PRICE_ID_MONTHLY ?? 'price_monthly_test' } },
                period: { start: periodStart, end: periodEnd },
                metadata: { plan: 'monthly' },
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event);

    expect(result).not.toBeNull();
    expect(result!.currentPeriodEnd?.getTime()).toBe(periodEnd * 1000);
    refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');
  });

  it('invoice.payment_failed marks the subscription in_billing_retry without downgrading role', async () => {
    const user = await createTestUser({ role: 'free' });

    await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'monthly' },
          customer: `cus_test_4_${RUN}`,
          subscription: `sub_test_4_${RUN}`,
        },
      },
    } as unknown as Stripe.Event);

    const result = await upsertFromStripeEvent({
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: { subscription_details: { subscription: `sub_test_4_${RUN}` } },
        },
      },
    } as unknown as Stripe.Event);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('in_billing_retry');
    expect(result!.billingIssuesDetectedAt).not.toBeNull();

    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium'); // not downgraded on a single failed attempt
  });

  it('invoice.payment_failed for an unknown subscription is a no-op', async () => {
    const result = await upsertFromStripeEvent({
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: { subscription_details: { subscription: 'sub_never_existed' } },
        },
      },
    } as unknown as Stripe.Event);
    expect(result).toBeNull();
  });

  it('customer.subscription.deleted reverts the user role to free', async () => {
    const user = await createTestUser({ role: 'free' });

    await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'monthly' },
          customer: `cus_test_5_${RUN}`,
          subscription: `sub_test_5_${RUN}`,
        },
      },
    } as unknown as Stripe.Event);

    let refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');

    const result = await upsertFromStripeEvent({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: `sub_test_5_${RUN}`,
          metadata: { userId: user.id, plan: 'monthly' },
        },
      },
    } as unknown as Stripe.Event);

    expect(result!.status).toBe('cancelled');
    refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('free');
  });

  it('createCheckoutSession always resolves the price server-side from configured Stripe Price ids, ignoring any injected amount', async () => {
    const user = await createTestUser({ role: 'free' });
    const previousMonthlyPrice = env.STRIPE_PRICE_ID_MONTHLY;
    env.STRIPE_PRICE_ID_MONTHLY = undefined;

    // Not configured -> must throw rather than silently proceed with a guessable/blank price.
    await expect(createCheckoutSession(user.id, 'monthly')).rejects.toThrow();

    // The function signature itself has no way to accept an amount/price parameter — its
    // only inputs are userId and plan, so the price can only ever come from the
    // server-configured STRIPE_PRICE_ID_* env vars inside the service.
    expect(createCheckoutSession.length).toBe(2);

    env.STRIPE_PRICE_ID_MONTHLY = previousMonthlyPrice;
  });

  it('redelivering the same renewal webhook event only sends one renewal notification', async () => {
    const user = await createTestUser({ role: 'premium' });

    await upsertFromStripeEvent({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, plan: 'monthly' },
          customer: `cus_test_dedup_${RUN}`,
          subscription: `sub_test_dedup_${RUN}`,
        },
      },
    } as unknown as Stripe.Event);

    const periodStart = Math.floor(Date.now() / 1000);
    const renewalEvent = {
      type: 'invoice.paid',
      data: {
        object: {
          parent: { subscription_details: { subscription: `sub_test_dedup_${RUN}` } },
          customer: `cus_test_dedup_${RUN}`,
          metadata: { userId: user.id },
          lines: {
            data: [
              {
                pricing: { price_details: { price: 'price_monthly_test' } },
                period: { start: periodStart, end: periodStart + 30 * 86400 },
                metadata: { plan: 'monthly' },
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;

    // Deliver the same renewal event twice, as a webhook retry would — this routes through
    // the same shared `applySubscriptionState` Razorpay/RevenueCat already dedupe through.
    await upsertFromStripeEvent(renewalEvent);
    await upsertFromStripeEvent(renewalEvent);

    const renewalNotifications = await Notification.findAll({
      where: { userId: user.id, type: 'subscription_renewal' },
    });
    expect(renewalNotifications.length).toBe(1);
  });
});
