import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestSubscription } from '@testHelpers';
import { getRevenueMetrics } from '../subscriptions.repository';
import { PLAN_PRICES_INR } from '../subscriptions.constants';

describe('getRevenueMetrics', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('aggregates counts, MRR/ARR, and churn correctly across mixed subscription states', async () => {
    const [monthlyUser, yearlyUser, lifetimeUser, cancelledUser, expiredUser] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ]);

    await Promise.all([
      createTestSubscription(monthlyUser.id, { status: 'active', plan: 'monthly', isLifetime: false }),
      createTestSubscription(yearlyUser.id, { status: 'in_grace_period', plan: 'yearly', isLifetime: false }),
      createTestSubscription(lifetimeUser.id, { status: 'active', plan: 'lifetime', isLifetime: true }),
      createTestSubscription(cancelledUser.id, { status: 'cancelled', plan: 'monthly', isLifetime: false }),
      createTestSubscription(expiredUser.id, { status: 'expired', plan: 'yearly', isLifetime: false }),
    ]);

    const metrics = await getRevenueMetrics();

    expect(metrics.breakdown.lifetime).toBeGreaterThanOrEqual(1);
    expect(metrics.breakdown.cancelled).toBeGreaterThanOrEqual(1);
    expect(metrics.breakdown.expired).toBeGreaterThanOrEqual(1);
    expect(metrics.activeSubscriptions).toBe(
      metrics.breakdown.monthly + metrics.breakdown.yearly + metrics.breakdown.lifetime
    );

    const expectedMrr =
      metrics.breakdown.monthly * PLAN_PRICES_INR.monthly +
      Math.round((metrics.breakdown.yearly * PLAN_PRICES_INR.yearly) / 12);
    expect(metrics.mrr).toBe(expectedMrr);
    expect(metrics.arr).toBe(expectedMrr * 12);

    const expectedTotalTracked = metrics.activeSubscriptions + metrics.breakdown.cancelled;
    const expectedChurn =
      expectedTotalTracked > 0
        ? Number(((metrics.breakdown.cancelled / expectedTotalTracked) * 100).toFixed(1))
        : 0;
    expect(metrics.churnRate).toBe(expectedChurn);
  });
});
