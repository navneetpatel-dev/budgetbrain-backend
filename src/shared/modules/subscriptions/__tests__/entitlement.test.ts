import { describe, expect, it } from 'vitest';
import { createTestUser } from '@testHelpers';
import { User } from '@database/models';
import { applySubscriptionState, getEntitlementForUser } from '../subscriptions.service';

describe('role-granted Pro entitlement', () => {
  it('treats admin and lifetime as entitled and free as not', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const lifetime = await createTestUser({ role: 'lifetime' });
    const free = await createTestUser({ role: 'free' });

    const adminEntitlement = await getEntitlementForUser(admin.id);
    expect(adminEntitlement.isEntitled).toBe(true);
    expect(adminEntitlement.plan).toBe('monthly');
    expect(adminEntitlement.isLifetime).toBe(false);

    const lifetimeEntitlement = await getEntitlementForUser(lifetime.id);
    expect(lifetimeEntitlement.isEntitled).toBe(true);
    expect(lifetimeEntitlement.plan).toBe('lifetime');
    expect(lifetimeEntitlement.isLifetime).toBe(true);

    const freeEntitlement = await getEntitlementForUser(free.id);
    expect(freeEntitlement.isEntitled).toBe(false);
  });

  it('does not overwrite an admin role when a subscription becomes active', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const now = new Date();

    await applySubscriptionState({
      userId: admin.id,
      productId: 'pro_monthly',
      status: 'active',
      plan: 'monthly',
      store: 'razorpay',
      isLifetime: false,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 86_400_000),
      originalPurchaseDate: now,
      eventLabel: 'test-admin-preserved',
    });

    const refreshed = await User.findByPk(admin.id);
    expect(refreshed?.role).toBe('admin');
  });
});
