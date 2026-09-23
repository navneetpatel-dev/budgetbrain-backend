import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import {
  User,
  Transaction,
  Subscription,
  AiUsageQuota,
  AuditLog,
} from '@database/models';
import { deleteUserAccount, getUser } from '../users.service';
import { AppError } from '@shared/errors';

describe('deleteUserAccount', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('cascades deletion of all foreign-key dependent records and anonymizes audit logs', async () => {
    const user = await createTestUser();

    // Create dependent records
    const tx = await createTestTransaction(user.id, { amount: 100 });
    await Subscription.create({
      userId: user.id,
      productId: 'budgetbrain_pro_monthly',
      plan: 'monthly',
      store: 'razorpay',
      status: 'active',
      isLifetime: false,
    } as never);
    await AiUsageQuota.create({
      userId: user.id,
      periodMonth: '2026-09-01',
      tokensUsed: 500,
    } as never);

    // Call deleteUserAccount
    await deleteUserAccount(user.id);

    // Verify User is deleted
    await expect(getUser(user.id)).rejects.toThrow(AppError);
    const userRow = await User.findByPk(user.id);
    expect(userRow).toBeNull();

    // Verify dependents deleted
    const txRow = await Transaction.findByPk(tx.id);
    expect(txRow).toBeNull();

    const subRow = await Subscription.findOne({ where: { userId: user.id } });
    expect(subRow).toBeNull();

    const quotaRow = await AiUsageQuota.findOne({ where: { userId: user.id } });
    expect(quotaRow).toBeNull();

    // Verify AuditLog retained but userId nulled
    const auditRows = await AuditLog.findAll({ where: { resourceId: user.id } });
    expect(auditRows.length).toBeGreaterThan(0);
    for (const log of auditRows) {
      expect(log.userId).toBeNull();
    }
  });
});
