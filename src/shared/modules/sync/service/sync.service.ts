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
  /** Server-assigned row id — only present for a successfully applied `create` action, so a
   * client can match a resource queued offline alongside it (e.g. a receipt attachment) to
   * the real row once it exists. */
  serverId?: string;
}

/**
 * Latest Update Wins Comparator:
 * Returns 'client' if client timestamp is strictly newer than server timestamp.
 * In case of tie or server being newer, server wins ('server').
 */
export function resolveConflict(clientTimestampMs: number, serverTimestampMs: number): 'client' | 'server' {
  return clientTimestampMs > serverTimestampMs ? 'client' : 'server';
}

const NEVER_MERGE_FIELDS = new Set(['id', 'userId', 'createdAt', 'updatedAt']);

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a instanceof Date || b instanceof Date) {
    const at = new Date(a as any).getTime();
    const bt = new Date(b as any).getTime();
    return !Number.isNaN(at) && !Number.isNaN(bt) && at === bt;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  // Decimal/numeric fields can round-trip as "150.00" (string, from Postgres DECIMAL) vs
  // 150 (number, from client JSON) — compare numerically rather than by strict type+value.
  const an = Number(a);
  const bn = Number(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn;
  return false;
}

/**
 * Field-level merge for a client-wins sync conflict. Only fields the client's payload
 * actually differs on (relative to the row's CURRENT server state) are included in the
 * resulting update — fields the payload omits, or that already match the server's current
 * value, are left completely untouched. This closes the whole-row-overwrite gap where an
 * offline client's full-object payload (carrying a stale copy of every field, not just the
 * one it actually edited) would otherwise clobber a *different* field's newer server-side
 * value with its own out-of-date copy.
 *
 * Known limitation (documented, not fixed by this pass): if BOTH the client and the server
 * changed the SAME field while the client was offline, this merge can't tell — there is no
 * per-field client-side timestamp to arbitrate with. In that case the field is included in
 * this "client differs from server" set like any other change, and the caller's existing
 * row-level `resolveConflict()` timestamp comparison (already run before this is called)
 * is what decided the client should win at all. A true 3-way merge would need mobile/web's
 * offline queues to track per-field change timestamps, which is out of scope here.
 */
export function mergeFields(
  existing: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(payload)) {
    if (NEVER_MERGE_FIELDS.has(key)) continue;
    if (!valuesEqual(payload[key], existing[key])) {
      merged[key] = payload[key];
    }
  }
  return merged;
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
          const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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

      const created = await transactionService.createTransaction(userId, item.payload as any, { transaction: t });
      return {
        id: item.id,
        resource: item.resource,
        action: 'create',
        status: 'applied',
        serverId: created?.id,
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
        const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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
          const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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
        const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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
          const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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
        const data = mergeFields(existing.get({ plain: true }) as unknown as Record<string, unknown>, item.payload as Record<string, unknown>);
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
