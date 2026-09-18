import { describe, it, expect, beforeAll } from 'vitest';
import { resolveConflict, processBatchSync } from '../service/sync.service';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { Transaction } from '@database/models';

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
});
