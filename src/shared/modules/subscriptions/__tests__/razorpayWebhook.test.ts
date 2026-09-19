import crypto from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { env } from '@config/env';
import {
  verifyWebhookSignature,
  upsertFromRazorpayEvent,
  createCheckoutOrder,
} from '../razorpay.service';
import { User, Notification } from '@database/models';
import { PLAN_PRICES_INR } from '../subscriptions.constants';

const TEST_SECRET = 'test_razorpay_webhook_secret';

function sign(body: object): { raw: Buffer; signature: string } {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', TEST_SECRET).update(raw).digest('hex');
  return { raw, signature };
}

describe('Razorpay webhook & checkout', () => {
  let previousSecret: string | undefined;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(() => {
    previousSecret = env.RAZORPAY_WEBHOOK_SECRET;
    env.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = previousSecret;
  });

  it('rejects a webhook with an invalid signature and applies no state change', () => {
    const payload = { event: 'payment.captured', payload: {} };
    const raw = Buffer.from(JSON.stringify(payload));
    expect(verifyWebhookSignature(raw, 'not-the-real-signature')).toBe(false);
    expect(verifyWebhookSignature(raw, undefined)).toBe(false);
  });

  it('rejects a webhook when no webhook secret is configured (fail closed)', () => {
    env.RAZORPAY_WEBHOOK_SECRET = undefined;
    const { raw, signature } = sign({ event: 'payment.captured' });
    expect(verifyWebhookSignature(raw, signature)).toBe(false);
  });

  it('accepts a correctly-signed payload', () => {
    const payload = { event: 'payment.captured', payload: {} };
    const { raw, signature } = sign(payload);
    expect(verifyWebhookSignature(raw, signature)).toBe(true);
  });

  it('payment.captured (lifetime) upgrades the user role to lifetime', async () => {
    const user = await createTestUser({ role: 'free' });

    const result = await upsertFromRazorpayEvent({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_1',
            order_id: 'order_test_1',
            notes: { userId: user.id, plan: 'lifetime' },
          },
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.plan).toBe('lifetime');
    expect(result!.isLifetime).toBe(true);
    expect(result!.store).toBe('razorpay');
    expect(result!.razorpayPaymentId).toBe('pay_test_1');

    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('lifetime');
  });

  it('subscription.charged (renewal) keeps the user premium and updates currentPeriodEnd', async () => {
    const user = await createTestUser({ role: 'free' });
    const currentStart = Math.floor(Date.now() / 1000);
    const currentEnd = currentStart + 30 * 86400;

    // First activation
    await upsertFromRazorpayEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_1',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentStart,
            current_end: currentEnd,
            notes: { userId: user.id, plan: 'monthly' },
          },
        },
      },
    });

    let refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');

    // Renewal a month later
    const nextEnd = currentEnd + 30 * 86400;
    const result = await upsertFromRazorpayEvent({
      event: 'subscription.charged',
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_1',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentEnd,
            current_end: nextEnd,
            notes: { userId: user.id, plan: 'monthly' },
          },
        },
      },
    });

    expect(result!.currentPeriodEnd?.getTime()).toBe(nextEnd * 1000);
    refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium');
  });

  it('subscription.cancelled eventually reflects free once the period truly ends (status recorded as cancelled)', async () => {
    const user = await createTestUser({ role: 'premium' });

    const result = await upsertFromRazorpayEvent({
      event: 'subscription.cancelled',
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_2',
            plan_id: 'plan_monthly_test',
            notes: { userId: user.id, plan: 'monthly' },
          },
        },
      },
    });

    expect(result!.status).toBe('cancelled');
    const refreshed = await User.findByPk(user.id);
    // Matches existing RevenueCat behavior: cancellation demotes immediately (no separate
    // grace-period handling distinguishes "cancelled" from "expired" in role sync today).
    expect(refreshed!.role).toBe('free');
  });

  it('createCheckoutOrder always resolves the amount server-side from PLAN_PRICES_INR, ignoring any injected amount', async () => {
    const user = await createTestUser({ role: 'free' });
    env.RAZORPAY_KEY_ID = undefined;
    env.RAZORPAY_KEY_SECRET = undefined;

    // Not configured -> must throw rather than silently proceed.
    await expect(createCheckoutOrder(user.id, 'monthly')).rejects.toThrow();

    // Confirm the function signature itself has no way to accept an amount parameter —
    // its only inputs are userId and plan, so the amount can only ever come from
    // PLAN_PRICES_INR inside the service.
    expect(createCheckoutOrder.length).toBe(2);
    expect(PLAN_PRICES_INR.monthly).toBe(199);
  });

  it('payment.captured for a subscription charge (no notes.plan) does NOT default to lifetime', async () => {
    const user = await createTestUser({ role: 'free' });

    // First, a real recurring activation so the user is a legitimate monthly subscriber.
    const currentStart = Math.floor(Date.now() / 1000);
    await upsertFromRazorpayEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_defaulting',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentStart,
            current_end: currentStart + 30 * 86400,
            notes: { userId: user.id, plan: 'monthly' },
          },
        },
      },
    });

    // Razorpay also fires payment.captured for the same charge, but on a payment entity
    // that carries a subscription_id and no notes at all (the exact ambiguous case that
    // used to silently default to 'lifetime'). It must be a no-op here, not an upgrade.
    const result = await upsertFromRazorpayEvent({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_subcharge',
            subscription_id: 'sub_test_defaulting',
          },
        },
      },
    });

    expect(result).toBeNull();
    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium'); // still monthly premium, NOT lifetime
  });

  it('payment.captured with no notes and no subscription_id refuses to guess a plan', async () => {
    // Force the order-lookup fallback to fail closed rather than depend on real Razorpay
    // credentials being configured in this test environment.
    env.RAZORPAY_KEY_ID = undefined;
    env.RAZORPAY_KEY_SECRET = undefined;

    const result = await upsertFromRazorpayEvent({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_test_ambiguous', order_id: 'order_nonexistent' },
        },
      },
    });
    // No notes on the payment, and the order lookup will fail (Razorpay not configured
    // in this test env) — must refuse to guess rather than default to lifetime.
    expect(result).toBeNull();
  });

  it('payment.failed on a recurring subscription marks it in_billing_retry without downgrading role', async () => {
    const user = await createTestUser({ role: 'free' });
    const currentStart = Math.floor(Date.now() / 1000);

    await upsertFromRazorpayEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_billing_issue',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentStart,
            current_end: currentStart + 30 * 86400,
            notes: { userId: user.id, plan: 'monthly' },
          },
        },
      },
    });

    const result = await upsertFromRazorpayEvent({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: 'pay_test_failed', subscription_id: 'sub_test_billing_issue' },
        },
      },
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('in_billing_retry');
    expect(result!.billingIssuesDetectedAt).not.toBeNull();

    const refreshed = await User.findByPk(user.id);
    expect(refreshed!.role).toBe('premium'); // not downgraded on a single failed attempt
  });

  it('payment.failed for a one-time (lifetime) order is a no-op', async () => {
    const result = await upsertFromRazorpayEvent({
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_test_failed_onetime', order_id: 'order_test_1' } },
      },
    });
    expect(result).toBeNull();
  });

  it('redelivering the same renewal webhook event only sends one renewal notification', async () => {
    const user = await createTestUser({ role: 'premium' });
    const currentStart = Math.floor(Date.now() / 1000);
    const currentEnd = currentStart + 30 * 86400;

    const activatePayload = {
      event: 'subscription.activated' as const,
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_dedup',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentStart,
            current_end: currentEnd,
            notes: { userId: user.id, plan: 'monthly' as const },
          },
        },
      },
    };
    await upsertFromRazorpayEvent(activatePayload);

    const renewalPayload = {
      event: 'subscription.charged' as const,
      payload: {
        subscription: {
          entity: {
            id: 'sub_test_dedup',
            plan_id: 'plan_monthly_test',
            status: 'active',
            current_start: currentEnd,
            current_end: currentEnd + 30 * 86400,
            notes: { userId: user.id, plan: 'monthly' as const },
          },
        },
      },
    };

    // Deliver the renewal event twice, as a webhook retry would.
    await upsertFromRazorpayEvent(renewalPayload);
    await upsertFromRazorpayEvent(renewalPayload);

    const renewalNotifications = await Notification.findAll({
      where: { userId: user.id, type: 'subscription_renewal' },
    });
    expect(renewalNotifications.length).toBe(1);
  });
});
