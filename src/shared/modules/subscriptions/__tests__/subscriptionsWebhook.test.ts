import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import {
  upsertFromWebhookEvent,
  getEntitlementForUser,
} from '../subscriptions.service';
import { User } from '@database/models';

describe('Subscriptions Module - Webhook & Entitlement Handling', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('handles INITIAL_PURCHASE and upgrades user role to premium', async () => {
    const user = await createTestUser({ role: 'free' });

    const payload = {
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        id: 'evt_test_1',
        app_user_id: user.id,
        product_id: 'budgetbrain_pro_monthly',
        entitlement_ids: ['pro'],
        purchased_at_ms: Date.now(),
        expiration_at_ms: Date.now() + 30 * 86400000,
        store: 'app_store',
      },
    };

    const sub = await upsertFromWebhookEvent(payload);
    expect(sub).not.toBeNull();
    expect(sub!.plan).toBe('monthly');
    expect(sub!.status).toBe('active');

    // User role updated
    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser!.role).toBe('premium');

    // Entitlement gate check
    const entitlement = await getEntitlementForUser(user.id, 'pro');
    expect(entitlement.isEntitled).toBe(true);
    expect(entitlement.plan).toBe('monthly');
  });

  it('handles CANCELLATION and demotes user role to free upon expiration', async () => {
    const user = await createTestUser({ role: 'premium' });

    const payload = {
      api_version: '1.0',
      event: {
        type: 'CANCELLATION',
        id: 'evt_test_2',
        app_user_id: user.id,
        product_id: 'budgetbrain_pro_monthly',
        entitlement_ids: ['pro'],
        store: 'app_store',
      },
    };

    const sub = await upsertFromWebhookEvent(payload);
    expect(sub!.status).toBe('cancelled');

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser!.role).toBe('free');

    const entitlement = await getEntitlementForUser(user.id, 'pro');
    expect(entitlement.isEntitled).toBe(false);
  });

  it('handles LIFETIME purchase and upgrades user role to lifetime', async () => {
    const user = await createTestUser({ role: 'free' });

    const payload = {
      api_version: '1.0',
      event: {
        type: 'INITIAL_PURCHASE',
        id: 'evt_test_3',
        app_user_id: user.id,
        product_id: 'budgetbrain_lifetime_access',
        entitlement_ids: ['pro'],
        purchased_at_ms: Date.now(),
        store: 'play_store',
      },
    };

    const sub = await upsertFromWebhookEvent(payload);
    expect(sub!.plan).toBe('lifetime');
    expect(sub!.isLifetime).toBe(true);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser!.role).toBe('lifetime');

    const entitlement = await getEntitlementForUser(user.id, 'pro');
    expect(entitlement.isEntitled).toBe(true);
    expect(entitlement.isLifetime).toBe(true);
  });
});
