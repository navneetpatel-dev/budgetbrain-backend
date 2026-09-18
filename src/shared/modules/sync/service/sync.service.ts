import { Transaction, TransactionAttachment, Budget, Goal, sequelize } from '@database/models';
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
      if (item.resource === 'transaction' || item.resource === 'income') {
        const payload =
          item.resource === 'income'
            ? { ...(item.payload as any), type: 'income' }
            : item.payload;
        const result = await processTransactionSync(userId, { ...item, payload });
        result.resource = item.resource;
        results.push(result);
      } else if (item.resource === 'budget') {
        const result = await processBudgetSync(userId, item);
        results.push(result);
      } else if (item.resource === 'goal') {
        const result = await processGoalSync(userId, item);
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
          await transactionService.updateTransaction(userId, existing.id, data as any, { transaction: t });
          return {
            id: item.id,
            resource: item.resource,
            action: 'create',
            status: 'applied',
          };
        }

        return {
          id: item.id,
          resource: item.resource,
          action: 'create',
          status: 'conflict_server_kept',
          serverUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      await transactionService.createTransaction(userId, item.payload as any, { transaction: t });
      return {
        id: item.id,
        resource: item.resource,
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
          resource: item.resource,
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
          resource: item.resource,
          action: 'update',
          status: 'applied',
        };
      }

      return {
        id: item.id,
        resource: item.resource,
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
          resource: item.resource,
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
          resource: item.resource,
          action: 'delete',
          status: 'applied',
        };
      }

      return {
        id: item.id,
        resource: item.resource,
        action: 'delete',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    throw new AppError(400, `Unknown action: ${(item as any).action}`);
  });
}

async function processBudgetSync(userId: string, item: SyncBatchItem): Promise<SyncItemResult> {
  const clientTimestampMs = new Date(
    (item.payload as any)?.updatedAt ?? item.timestamp
  ).getTime();

  return sequelize.transaction(async (t) => {
    const targetId = (item.payload as any).id ?? item.id;

    if (item.action === 'create') {
      const existing = await Budget.findOne({
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
          await existing.update(data as any, { transaction: t });
          return { id: item.id, resource: 'budget', action: 'create', status: 'applied' };
        }

        return {
          id: item.id,
          resource: 'budget',
          action: 'create',
          status: 'conflict_server_kept',
          serverUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      const data = { ...item.payload, id: targetId, userId };
      await Budget.create(data as any, { transaction: t });
      return { id: item.id, resource: 'budget', action: 'create', status: 'applied' };
    }

    if (item.action === 'update') {
      const existing = await Budget.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return {
          id: item.id,
          resource: 'budget',
          action: 'update',
          status: 'error',
          error: 'Budget not found for update',
        };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        const data = { ...item.payload };
        delete (data as any).id;
        await existing.update(data as any, { transaction: t });
        return { id: item.id, resource: 'budget', action: 'update', status: 'applied' };
      }

      return {
        id: item.id,
        resource: 'budget',
        action: 'update',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    if (item.action === 'delete') {
      const existing = await Budget.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return { id: item.id, resource: 'budget', action: 'delete', status: 'applied' };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        await existing.destroy({ transaction: t });
        return { id: item.id, resource: 'budget', action: 'delete', status: 'applied' };
      }

      return {
        id: item.id,
        resource: 'budget',
        action: 'delete',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    throw new AppError(400, `Unknown action: ${(item as any).action}`);
  });
}

async function processGoalSync(userId: string, item: SyncBatchItem): Promise<SyncItemResult> {
  const clientTimestampMs = new Date(
    (item.payload as any)?.updatedAt ?? item.timestamp
  ).getTime();

  return sequelize.transaction(async (t) => {
    const targetId = (item.payload as any).id ?? item.id;

    if (item.action === 'create') {
      const existing = await Goal.findOne({
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
          await existing.update(data as any, { transaction: t });
          return { id: item.id, resource: 'goal', action: 'create', status: 'applied' };
        }

        return {
          id: item.id,
          resource: 'goal',
          action: 'create',
          status: 'conflict_server_kept',
          serverUpdatedAt: existing.updatedAt.toISOString(),
        };
      }

      const data = { ...item.payload, id: targetId, userId };
      await Goal.create(data as any, { transaction: t });
      return { id: item.id, resource: 'goal', action: 'create', status: 'applied' };
    }

    if (item.action === 'update') {
      const existing = await Goal.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return {
          id: item.id,
          resource: 'goal',
          action: 'update',
          status: 'error',
          error: 'Goal not found for update',
        };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        const data = { ...item.payload };
        delete (data as any).id;
        await existing.update(data as any, { transaction: t });
        return { id: item.id, resource: 'goal', action: 'update', status: 'applied' };
      }

      return {
        id: item.id,
        resource: 'goal',
        action: 'update',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    if (item.action === 'delete') {
      const existing = await Goal.findOne({
        where: { id: targetId, userId },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!existing) {
        return { id: item.id, resource: 'goal', action: 'delete', status: 'applied' };
      }

      const serverTimestampMs = existing.updatedAt.getTime();
      const winner = resolveConflict(clientTimestampMs, serverTimestampMs);

      if (winner === 'client') {
        await existing.destroy({ transaction: t });
        return { id: item.id, resource: 'goal', action: 'delete', status: 'applied' };
      }

      return {
        id: item.id,
        resource: 'goal',
        action: 'delete',
        status: 'conflict_server_kept',
        serverUpdatedAt: existing.updatedAt.toISOString(),
      };
    }

    throw new AppError(400, `Unknown action: ${(item as any).action}`);
  });
}
