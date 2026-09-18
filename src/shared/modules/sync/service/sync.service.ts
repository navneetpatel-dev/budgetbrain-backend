import { Transaction, TransactionAttachment, sequelize } from '@database/models';
import * as transactionService from '@shared/modules/expenses/service/transaction.service';
import { AppError } from '@shared/errors';
import type { SyncBatchItem } from '../types';

export interface SyncItemResult {
  id: string;
  status: 'applied' | 'conflict_server_kept' | 'error';
  resource: string;
  action: string;
  serverUpdatedAt?: string;
  error?: string;
}

/**
 * Latest Update Wins Comparator:
 * Returns 'client' if client timestamp is strictly newer than server timestamp.
 * In case of tie or server being newer, server wins ('server').
 */
export function resolveConflict(clientTimestampMs: number, serverTimestampMs: number): 'client' | 'server' {
  return clientTimestampMs > serverTimestampMs ? 'client' : 'server';
}

export async function processBatchSync(
  userId: string,
  items: SyncBatchItem[]
): Promise<{ results: SyncItemResult[] }> {
  const results: SyncItemResult[] = [];

  const sorted = [...items].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const item of sorted) {
    try {
      if (item.resource === 'transaction') {
        const result = await processTransactionSync(userId, item);
        results.push(result);
      } else {
        throw new AppError(400, `Unsupported sync resource: ${item.resource}`, 'UNSUPPORTED_RESOURCE');
      }
    } catch (err) {
      results.push({
        id: item.id,
        resource: item.resource,
        action: item.action,
        status: 'error',
        error: err instanceof AppError ? err.message : 'Sync failed',
      });
    }
  }

  return { results };
}

async function processTransactionSync(userId: string, item: SyncBatchItem): Promise<SyncItemResult> {
  const clientTimestampMs = new Date(
    (item.payload as any)?.updatedAt ?? item.timestamp
  ).getTime();

  return sequelize.transaction(async (t) => {
    if (item.action === 'create') {
      const targetId = (item.payload as any).id ?? item.id;
      const existing = await Transaction.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (existing) {
        const serverTimestampMs = existing.updatedAt.getTime();
        const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

        if (winner === 'client') {
          const data = { ...item.payload };
          delete (data as any).id;
          await transactionService.updateTransaction(userId, existing.id, data, { transaction: t });
          return {
            id: item.id,
            resource: 'transaction',
            action: 'create',
            status: 'applied',
          };
        }

        return {
          id: item.id,
          resource: 'transaction',
          action: 'create',
          status: 'conflict_server_kept',
          serverUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      await transactionService.createTransaction(userId, item.payload, { transaction: t });
      return {
        id: item.id,
        resource: 'transaction',
        action: 'create',
        status: 'applied',
      };
    }

    if (item.action === 'update') {
      const targetId = (item.payload as any).id ?? item.id;
      const existing = await Transaction.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return {
          id: item.id,
          resource: 'transaction',
          action: 'update',
          status: 'error',
          error: 'Transaction not found for update',
        };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        const data = { ...item.payload };
        delete (data as any).id;
        await transactionService.updateTransaction(userId, existing.id, data as any, { transaction: t });
        return {
          id: item.id,
          resource: 'transaction',
          action: 'update',
          status: 'applied',
        };
      }


      return {
        id: item.id,
        resource: 'transaction',
        action: 'update',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    if (item.action === 'delete') {
      const targetId = (item.payload as any).id ?? item.id;
      const existing = await Transaction.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return {
          id: item.id,
          resource: 'transaction',
          action: 'delete',
          status: 'applied',
        };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        await TransactionAttachment.destroy({ where: { transactionId: existing.id }, transaction: t });
        await existing.destroy({ transaction: t });
        return {
          id: item.id,
          resource: 'transaction',
          action: 'delete',
          status: 'applied',
        };
      }

      return {
        id: item.id,
        resource: 'transaction',
        action: 'delete',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    throw new AppError(400, `Unknown action: ${(item as any).action}`);
  });
}
