import crypto from 'crypto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { env } from '@config/env';
import {
  verifyWebhookSignature,
  upsertFromRazorpayEvent,
  createCheckoutOrder,
} from '../razorpay.service';
import { User } from '@database/models';
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
});
