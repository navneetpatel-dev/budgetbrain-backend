import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { AuditLog, DetectedTransaction, FinancialAccount, MerchantCategoryRule, Transaction, sequelize } from '@database/models';
import { env } from '@config/env';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import type { DetectedItemInput } from '../transactionDetection.types';
import {
  confirmPending,
  getSyncState,
  listDetected,
  listPending,
  rejectPending,
  syncBatch,
  undoDetected,
  updateDetectionSettings,
} from '../transactionDetection.service';
import { makeSignedItem } from './fixtures';

const today = new Date().toISOString().slice(0, 10);
const nowIso = new Date().toISOString();

let refCounter = 0;
/** A signed item dated today with a unique reference, so each call is a distinct transaction. */
function item(userId: string, overrides: Partial<DetectedItemInput> = {}): DetectedItemInput {
  refCounter += 1;
  return makeSignedItem(userId, {
    clientId: `c${refCounter}`,
    transactionDate: today,
    receivedAt: nowIso,
    referenceNumber: `REF${String(refCounter).padStart(9, '0')}`,
    ...overrides,
  });
}

const weakEvidence = {
  templateMatched: false,
  institutionVerified: true,
  amountRoleUnique: true,
  directionUnambiguous: true,
  merchantKnown: false,
  dateExtracted: false,
  referencePresent: false,
  merchantFuzzy: false,
};

describe('detected transaction sync', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(() => {
    env.DETECTION_AUTO_CREATE_ENABLED = 'true';
    env.DETECTION_ENABLED = 'true';
  });

  it('creates high-confidence items through the normal transaction path and queues the rest', async () => {
    const user = await createTestUser();
    const high = item(user.id);
    const medium = item(user.id, { evidence: weakEvidence, referenceNumber: null, confidenceTier: 'high' });

    const res = await syncBatch(user.id, { items: [high, medium] });

    expect(res.results.map((r) => r.status)).toEqual(['created', 'needs_review']);
    expect(res).toMatchObject({ createdCount: 1, needsReviewCount: 1, failedCount: 0, alreadySyncedCount: 0 });

    const tx = await Transaction.findByPk(res.results[0].transactionId!);
    expect(tx).toMatchObject({ type: 'expense', source: 'detected', detectedTransactionId: res.results[0].detectedId });
    expect(Number(tx!.amount)).toBe(1250);

    const audit = await AuditLog.count({ where: { resourceId: tx!.id, action: 'transaction.create' } });
    expect(audit).toBe(1);

    const pending = await DetectedTransaction.findByPk(res.results[1].detectedId!);
    expect(pending).toMatchObject({ status: 'pending_review', reviewReason: 'medium_confidence', confidenceTier: 'medium' });
  });

  it('never trusts a client-claimed tier: weak evidence claiming "high" goes to review', async () => {
    const user = await createTestUser();
    const res = await syncBatch(user.id, {
      items: [item(user.id, { confidenceTier: 'high', evidence: { ...weakEvidence, institutionVerified: false } })],
    });
    expect(res.results[0].status).toBe('needs_review');
  });

  it('does not accept a verified institution without an institution id', async () => {
    const user = await createTestUser();
    const res = await syncBatch(user.id, { items: [item(user.id, { institutionId: null })] });
    expect(res.results[0].status).toBe('needs_review');
  });

  it('is idempotent: replaying a batch creates nothing new', async () => {
    const user = await createTestUser();
    const batch = { items: [item(user.id), item(user.id)] };
    await syncBatch(user.id, batch);
    const replay = await syncBatch(user.id, batch);
    expect(replay.results.map((r) => r.status)).toEqual(['already_synced', 'already_synced']);
    expect(replay.results[0].detectedId).toBeTruthy();
    expect(await Transaction.count({ where: { userId: user.id } })).toBe(2);
  });

  it('handles concurrent syncs of the same transaction without errors or duplicates (gap D2)', async () => {
    const user = await createTestUser();
    const same = item(user.id);
    const results = await Promise.all([
      syncBatch(user.id, { items: [same] }),
      syncBatch(user.id, { items: [same] }),
      syncBatch(user.id, { items: [same] }),
    ]);
    const statuses = results.map((r) => r.results[0].status).sort();
    expect(statuses).toEqual(['already_synced', 'already_synced', 'created']);
    expect(await DetectedTransaction.count({ where: { userId: user.id } })).toBe(1);
    expect(await Transaction.count({ where: { userId: user.id } })).toBe(1);
  });

  it('stores a repeat inside one batch once', async () => {
    const user = await createTestUser();
    const one = item(user.id);
    const res = await syncBatch(user.id, { items: [one, { ...one, clientId: 'again' }] });
    expect(res.results.map((r) => r.status)).toEqual(['created', 'already_synced']);
    expect(res.results[1].clientId).toBe('again');
  });

  it('uses the server fingerprint, not the client one', async () => {
    const user = await createTestUser();
    const forged = { ...item(user.id), dedupFingerprint: 'v2_' + 'f'.repeat(64) };
    const res = await syncBatch(user.id, { items: [forged] });
    expect(res.results[0].fingerprint).not.toBe(forged.dedupFingerprint);
    const row = await DetectedTransaction.findByPk(res.results[0].detectedId!);
    expect(row!.dedupFingerprint).toBe(res.results[0].fingerprint);
  });

  it("rejects another user's category and account per item without failing the batch", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const foreignCategory = await createTestCategory(other.id);
    const foreignAccount = await FinancialAccount.create({
      userId: other.id, name: 'X', type: 'bank', balance: 0, currency: 'INR', isActive: true,
    } as never);
    const res = await syncBatch(user.id, {
      items: [
        item(user.id, { categoryId: foreignCategory.id }),
        item(user.id, { financialAccountId: foreignAccount.id }),
        item(user.id),
      ],
    });
    expect(res.results.map((r) => r.status)).toEqual(['validation_error', 'validation_error', 'created']);
  });

  it('rejects impossible classifications instead of storing them', async () => {
    const user = await createTestUser();
    const res = await syncBatch(user.id, { items: [item(user.id, { transactionType: 'income' })] });
    expect(res.results[0]).toMatchObject({ status: 'validation_error' });
  });

  it("applies the user's merchant rule over a catalog category (gap L1)", async () => {
    const user = await createTestUser();
    const catalog = await createTestCategory(user.id, { name: 'Food' });
    const mine = await createTestCategory(user.id, { name: 'Office lunches' });
    await MerchantCategoryRule.create({ userId: user.id, merchant: 'swiggy', categoryId: mine.id });

    const res = await syncBatch(user.id, {
      items: [
        item(user.id, { merchantName: 'Swiggy', categoryId: catalog.id, categorySource: 'knowledge_base' }),
        item(user.id, { merchantName: 'Swiggy', categoryId: catalog.id, categorySource: 'user' }),
      ],
    });
    const [ruled, chosen] = await Promise.all(res.results.map((r) => Transaction.findByPk(r.transactionId!)));
    expect(ruled!.categoryId).toBe(mine.id);
    expect(chosen!.categoryId).toBe(catalog.id);
  });

  it('creates refunds and transfer legs with the right balance effect', async () => {
    const user = await createTestUser();
    const account = await FinancialAccount.create({
      userId: user.id, name: 'Savings', type: 'bank', balance: 10000, currency: 'INR', isActive: true,
    } as never);
    const res = await syncBatch(user.id, {
      items: [
        item(user.id, { direction: 'CREDIT', transactionType: 'refund', amount: '500.00', financialAccountId: account.id }),
        item(user.id, { transactionType: 'transfer', subtype: 'card_bill', amount: '3000.00', financialAccountId: account.id }),
        item(user.id, { amount: '250.50', financialAccountId: account.id }),
      ],
    });
    expect(res.createdCount).toBe(3);
    await account.reload();
    expect(Number(account.balance)).toBe(10000 + 500 - 3000 - 250.5);
    const transfer = await Transaction.findByPk(res.results[1].transactionId!);
    expect(transfer).toMatchObject({ type: 'transfer', direction: 'DEBIT', subtype: 'card_bill', categoryId: null });
  });

  it('respects the kill switch and the user preference', async () => {
    const user = await createTestUser();
    env.DETECTION_AUTO_CREATE_ENABLED = 'false';
    const off = await syncBatch(user.id, { items: [item(user.id)] });
    expect(off.results[0].status).toBe('needs_review');
    expect((await DetectedTransaction.findByPk(off.results[0].detectedId!))!.reviewReason).toBe('kill_switch');

    env.DETECTION_AUTO_CREATE_ENABLED = 'true';
    await updateDetectionSettings(user.id, { autoAddHighConfidence: false });
    const userOff = await syncBatch(user.id, { items: [item(user.id)] });
    expect((await DetectedTransaction.findByPk(userOff.results[0].detectedId!))!.reviewReason).toBe('auto_add_disabled');

    env.DETECTION_ENABLED = 'false';
    await expect(syncBatch(user.id, { items: [item(user.id)] })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('uses a constant number of queries per batch (plan §3.2)', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id);
    const count = async (n: number) => {
      const items = Array.from({ length: n }, () => item(user.id, { categoryId: category.id }));
      let queries = 0;
      // Sequelize calls options.logging once per SQL statement.
      const options = (sequelize as unknown as { options: { logging: unknown } }).options;
      const previous = options.logging;
      options.logging = () => {
        queries += 1;
      };
      try {
        await syncBatch(user.id, { items });
      } finally {
        options.logging = previous;
      }
      return queries;
    };
    const small = await count(2);
    const large = await count(60);
    expect(large).toBe(small);
    expect(large).toBeLessThanOrEqual(10);
  });

  describe('review actions', () => {
    async function pendingItem(userId: string, overrides: Partial<DetectedItemInput> = {}) {
      const res = await syncBatch(userId, { items: [item(userId, { evidence: weakEvidence, ...overrides })] });
      return res.results[0].detectedId!;
    }

    it('lists pending items with string amounts and flattened names (gap P0-7)', async () => {
      const user = await createTestUser();
      const category = await createTestCategory(user.id, { name: 'Food' });
      await pendingItem(user.id, { categoryId: category.id, amount: '99.50' });
      const { rows, count } = await listPending(user.id);
      expect(count).toBe(1);
      expect(rows[0]).toMatchObject({ amount: '99.50', categoryName: 'Food', status: 'pending_review', reviewReason: 'medium_confidence' });
      expect(typeof rows[0].amount).toBe('string');
    });

    it('confirms, and learns a rule only when the user changed the category (gap L3)', async () => {
      const user = await createTestUser();
      const food = await createTestCategory(user.id, { name: 'Food' });
      const office = await createTestCategory(user.id, { name: 'Office' });

      const unchanged = await pendingItem(user.id, { categoryId: food.id, merchantName: 'Zomato' });
      await confirmPending(user.id, unchanged, { categoryId: food.id, learnMerchantCategory: true } as never);
      expect(await MerchantCategoryRule.count({ where: { userId: user.id } })).toBe(0);

      const changed = await pendingItem(user.id, { categoryId: food.id, merchantName: 'Zomato' });
      const dto = await confirmPending(user.id, changed, { categoryId: office.id, learnMerchantCategory: true } as never);
      expect(dto.status).toBe('user_confirmed');
      const rule = await MerchantCategoryRule.findOne({ where: { userId: user.id } });
      expect(rule).toMatchObject({ merchant: 'zomato', categoryId: office.id });
      const tx = await Transaction.findByPk(dto.createdTransactionId!);
      expect(tx).toMatchObject({ source: 'detected', categoryId: office.id });
    });

    it('lets the user correct the type while confirming, within the direction rules', async () => {
      const user = await createTestUser();
      const id = await pendingItem(user.id, { direction: 'CREDIT', transactionType: 'income' });
      await expect(confirmPending(user.id, id, { transactionType: 'expense' } as never)).rejects.toMatchObject({ statusCode: 400 });
      const dto = await confirmPending(user.id, id, { transactionType: 'refund' } as never);
      expect(dto.transactionType).toBe('refund');
    });

    it('rejects only pending items (gap R4)', async () => {
      const user = await createTestUser();
      const id = await pendingItem(user.id);
      await rejectPending(user.id, id);
      await expect(rejectPending(user.id, id)).rejects.toMatchObject({ statusCode: 400 });

      const auto = await syncBatch(user.id, { items: [item(user.id)] });
      await expect(rejectPending(user.id, auto.results[0].detectedId!)).rejects.toMatchObject({ statusCode: 400 });
    });

    it('undoes an auto-added item and restores the balance (gap R5)', async () => {
      const user = await createTestUser();
      const account = await FinancialAccount.create({
        userId: user.id, name: 'Savings', type: 'bank', balance: 1000, currency: 'INR', isActive: true,
      } as never);
      const original = item(user.id, { amount: '200.00', financialAccountId: account.id });
      const res = await syncBatch(user.id, { items: [original] });
      await account.reload();
      expect(Number(account.balance)).toBe(800);

      const dto = await undoDetected(user.id, res.results[0].detectedId!);
      expect(dto).toMatchObject({ status: 'rejected', createdTransactionId: null });
      expect(await Transaction.findByPk(res.results[0].transactionId!)).toBeNull();
      await account.reload();
      expect(Number(account.balance)).toBe(1000);

      // The row stays, so re-syncing the same message doesn't bring it back.
      const again = await syncBatch(user.id, { items: [original] });
      expect(again.results[0].status).toBe('already_synced');
      expect(await Transaction.count({ where: { userId: user.id } })).toBe(0);
    });

    it("can't touch another user's items", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      const id = await pendingItem(owner.id);
      await expect(rejectPending(intruder.id, id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(undoDetected(intruder.id, id)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lists auto-added items and reports sync state', async () => {
      const user = await createTestUser();
      await syncBatch(user.id, { items: [item(user.id), item(user.id, { evidence: weakEvidence })] });
      const auto = await listDetected(user.id, { status: 'auto_approved' });
      expect(auto.count).toBe(1);
      const state = await getSyncState(user.id);
      expect(state).toEqual({ latestSyncedTransactionDate: today, totalDetectedCount: 2, pendingReviewCount: 1 });
    });
  });
});
