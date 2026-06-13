import { Transaction } from '../../models';
import * as transactionService from '../expenses/transaction.service';
import { AppError } from '../../utils/errors';

interface SyncItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  resource: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export async function processBatchSync(userId: string, items: SyncItem[]) {
  const results: Array<{ id: string; status: 'success' | 'error'; error?: string }> = [];

  const sorted = [...items].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const item of sorted) {
    try {
      if (item.resource === 'transaction') {
        await processTransactionSync(userId, item);
      }
      results.push({ id: item.id, status: 'success' });
    } catch (err) {
      results.push({
        id: item.id,
        status: 'error',
        error: err instanceof AppError ? err.message : 'Sync failed',
      });
    }
  }

  return { processed: results.filter((r) => r.status === 'success').length, results };
}

async function processTransactionSync(userId: string, item: SyncItem) {
  const payload = item.payload;

  if (item.action === 'create') {
    await transactionService.createTransaction(userId, payload as Parameters<typeof transactionService.createTransaction>[1]);
    return;
  }

  const txId = payload.id as string;
  if (!txId) throw new AppError(400, 'Transaction ID required for update/delete');

  if (item.action === 'update') {
    const existing = await Transaction.findOne({ where: { id: txId, userId } });
    if (existing && new Date(existing.updatedAt) > new Date(item.timestamp)) {
      return;
    }
    await transactionService.updateTransaction(userId, txId, payload as Parameters<typeof transactionService.updateTransaction>[2]);
    return;
  }

  if (item.action === 'delete') {
    await transactionService.deleteTransaction(userId, txId);
  }
}
