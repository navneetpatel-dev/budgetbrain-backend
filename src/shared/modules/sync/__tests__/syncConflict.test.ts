import { describe, it, expect, beforeAll } from 'vitest';
import { resolveConflict, processBatchSync, mergeFields } from '../sync.service';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { Transaction, Budget, Goal } from '@database/models';
import { createBudget } from '@shared/modules/budgets/service/budget.service';
import { createGoal } from '@shared/modules/goals/goals.service';

describe('Sync Module - Conflict Resolution & Batch Sync', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  describe('resolveConflict', () => {
    it('client wins when client timestamp is strictly greater than server timestamp', () => {
      const serverMs = 1700000000000;
      const clientMs = 1700000005000;
      expect(resolveConflict(clientMs, serverMs)).toBe('client');
    });

    it('server wins when server timestamp is newer than client timestamp', () => {
      const serverMs = 1700000010000;
      const clientMs = 1700000005000;
      expect(resolveConflict(clientMs, serverMs)).toBe('server');
    });

    it('server wins on tie-break (equal timestamps)', () => {
      const timestampMs = 1700000000000;
      expect(resolveConflict(timestampMs, timestampMs)).toBe('server');
    });
  });

  describe('processBatchSync with conflict resolution', () => {
    it('retains server version when server has newer timestamp (conflict_server_kept)', async () => {
      const user = await createTestUser();
      const serverTx = await createTestTransaction(user.id, {
        amount: 500,
        merchant: 'Server Version',
      });

      // Client sync item with older timestamp
      const olderClientTimestamp = new Date(serverTx.updatedAt.getTime() - 10000).toISOString();
      const batchItem = {
        id: serverTx.id,
        resource: 'transaction',
        action: 'update',
        timestamp: olderClientTimestamp,
        payload: {
          id: serverTx.id,
          amount: 300,
          merchant: 'Older Client Version',
          updatedAt: olderClientTimestamp,
        },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('conflict_server_kept');

      // Server data remains unchanged
      const reloaded = await Transaction.findByPk(serverTx.id);
      expect(Number(reloaded!.amount)).toBe(500);
      expect(reloaded!.merchant).toBe('Server Version');
    });

    it('applies client update when client timestamp is newer', async () => {
      const user = await createTestUser();
      const serverTx = await createTestTransaction(user.id, {
        amount: 200,
        merchant: 'Initial Merchant',
      });

      // Client sync item with newer timestamp
      const newerClientTimestamp = new Date(serverTx.updatedAt.getTime() + 10000).toISOString();
      const batchItem = {
        id: serverTx.id,
        resource: 'transaction',
        action: 'update',
        timestamp: newerClientTimestamp,
        payload: {
          id: serverTx.id,
          amount: 350,
          merchant: 'Newer Client Update',
          updatedAt: newerClientTimestamp,
        },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('applied');

      const reloaded = await Transaction.findByPk(serverTx.id);
      expect(Number(reloaded!.amount)).toBe(350);
      expect(reloaded!.merchant).toBe('Newer Client Update');
    });
  });

  describe('mergeFields — plan item 18, field-level merge (non-overlapping fields, backend-only)', () => {
    it('unit: keeps only fields that actually differ from the current server value, dropping unchanged/omitted keys', () => {
      const existing = { amount: 200, merchant: 'Server Merchant', notes: 'old notes', categoryId: 'cat-1' };
      // Payload omits `categoryId` entirely and repeats `merchant`'s already-current value —
      // neither should appear in the merged result.
      const payload = { amount: 999, merchant: 'Server Merchant', notes: 'new notes' };
      const merged = mergeFields(existing, payload);
      expect(merged).toEqual({ amount: 999, notes: 'new notes' });
      expect(merged).not.toHaveProperty('categoryId');
    });

    it('unit: never merges id/userId/createdAt/updatedAt even if present in the payload', () => {
      const existing = { id: 'a', userId: 'u1', amount: 100 };
      const payload = { id: 'b', userId: 'u2', createdAt: '2020-01-01', updatedAt: '2020-01-02', amount: 250 };
      const merged = mergeFields(existing, payload);
      expect(merged).toEqual({ amount: 250 });
    });

    it('transaction: a same-record sync only overwrites the field the client actually changed, preserving a field the payload omits', async () => {
      const user = await createTestUser();
      const serverTx = await createTestTransaction(user.id, {
        amount: 200,
        merchant: 'Original Merchant',
        notes: 'original notes',
      });

      // Server independently edits `notes` after creation, bumping updatedAt.
      await new Promise((r) => setTimeout(r, 10));
      await serverTx.update({ notes: 'server-updated notes' });

      // Client's offline payload is a stale FULL-object copy from before the server's notes
      // edit — it only actually changed `amount`, but a naive whole-row overwrite would still
      // clobber the server's newer `notes` with the client's stale copy. The client payload
      // here deliberately omits `notes` to represent "client never touched this field" per
      // the resolved backend-only merge scope (mobile/web sending a true diff, not a stale
      // full snapshot, is the client-side half of this fix — out of scope here).
      const newerClientTimestamp = new Date(Date.now() + 60_000).toISOString();
      const batchItem = {
        id: serverTx.id,
        resource: 'transaction',
        action: 'update',
        timestamp: newerClientTimestamp,
        payload: {
          id: serverTx.id,
          amount: 350,
          updatedAt: newerClientTimestamp,
        },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results[0].status).toBe('applied');

      const reloaded = await Transaction.findByPk(serverTx.id);
      expect(Number(reloaded!.amount)).toBe(350); // client's actual change applied
      expect(reloaded!.notes).toBe('server-updated notes'); // untouched field preserved, not clobbered
    });

    it('transaction: a field both sides changed still resolves via the existing row-level timestamp winner (documented limitation)', async () => {
      const user = await createTestUser();
      const serverTx = await createTestTransaction(user.id, { amount: 100, merchant: 'Original' });

      await new Promise((r) => setTimeout(r, 10));
      await serverTx.update({ merchant: 'Server Merchant' });

      const newerClientTimestamp = new Date(Date.now() + 60_000).toISOString();
      const batchItem = {
        id: serverTx.id,
        resource: 'transaction',
        action: 'update',
        timestamp: newerClientTimestamp,
        payload: { id: serverTx.id, merchant: 'Client Merchant', updatedAt: newerClientTimestamp },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results[0].status).toBe('applied');

      const reloaded = await Transaction.findByPk(serverTx.id);
      // No per-field client timestamp exists to arbitrate the same-field conflict, so the
      // row-level resolveConflict() winner (client, since its timestamp is newer here) wins
      // this field too — the documented limitation this test makes explicit.
      expect(reloaded!.merchant).toBe('Client Merchant');
    });

    it('budget: a same-record sync preserves a field the client payload omits', async () => {
      const user = await createTestUser();
      const budget = await createBudget(user.id, {
        name: 'Groceries',
        type: 'monthly',
        amount: 1000,
        startDate: new Date().toISOString().slice(0, 10),
      });

      await new Promise((r) => setTimeout(r, 10));
      const budgetRow = await Budget.findByPk(budget.id);
      await budgetRow!.update({ name: 'Server Renamed Groceries' });

      const newerClientTimestamp = new Date(Date.now() + 60_000).toISOString();
      const batchItem = {
        id: budget.id,
        resource: 'budget',
        action: 'update',
        timestamp: newerClientTimestamp,
        payload: { id: budget.id, amount: 1500, updatedAt: newerClientTimestamp },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results[0].status).toBe('applied');

      const reloaded = await Budget.findByPk(budget.id);
      expect(Number(reloaded!.amount)).toBe(1500);
      expect(reloaded!.name).toBe('Server Renamed Groceries');
    });

    it('goal: a same-record sync preserves a field the client payload omits', async () => {
      const user = await createTestUser();
      const goal = await createGoal(user.id, { name: 'Vacation', targetAmount: 10000, type: 'vacation' });

      await new Promise((r) => setTimeout(r, 10));
      const goalRow = await Goal.findByPk(goal.id);
      await goalRow!.update({ name: 'Server Renamed Vacation' });

      const newerClientTimestamp = new Date(Date.now() + 60_000).toISOString();
      const batchItem = {
        id: goal.id,
        resource: 'goal',
        action: 'update',
        timestamp: newerClientTimestamp,
        payload: { id: goal.id, targetAmount: 15000, updatedAt: newerClientTimestamp },
      };

      const { results } = await processBatchSync(user.id, [batchItem as any]);
      expect(results[0].status).toBe('applied');

      const reloaded = await Goal.findByPk(goal.id);
      expect(Number(reloaded!.targetAmount)).toBe(15000);
      expect(reloaded!.name).toBe('Server Renamed Vacation');
    });
  });
});
