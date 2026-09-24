import { describe, it, expect, beforeAll } from 'vitest';
import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { DetectedTransaction, sequelize } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';

/**
 * Guard for what's already right (plan T9.4, D1): one detected record per user and fingerprint,
 * enforced by the database. Sync's `ON CONFLICT DO NOTHING` relies on this index.
 */
describe('detected_transactions (user_id, dedup_fingerprint) unique index (D1)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('exists on exactly those two columns', async () => {
    const indexes = await sequelize.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'detected_transactions' AND indexdef LIKE 'CREATE UNIQUE INDEX%'`,
      { type: QueryTypes.SELECT }
    );
    expect(indexes.some((i) => /\(user_id, dedup_fingerprint\)$/.test(i.indexdef))).toBe(true);
  });

  it('rejects a second record with the same fingerprint for the same user, not for another user', async () => {
    const [a, b] = [await createTestUser(), await createTestUser()];
    const row = (userId: string) => ({
      userId,
      amount: 10,
      currency: 'INR',
      direction: 'DEBIT' as const,
      transactionType: 'expense' as const,
      transactionDate: '2026-09-23',
      confidence: 0.9,
      dedupFingerprint: 'v2:d1-guard-fingerprint',
      source: 'android_sms' as const,
      status: 'pending_review' as const,
    });
    await DetectedTransaction.create(row(a.id) as never);
    await expect(DetectedTransaction.create(row(a.id) as never)).rejects.toBeInstanceOf(UniqueConstraintError);
    await expect(DetectedTransaction.create(row(b.id) as never)).resolves.toBeTruthy();
  });
});
