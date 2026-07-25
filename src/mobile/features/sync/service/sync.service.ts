import { Transaction } from '../../../../shared/models';
import * as transactionService from '../../expenses/service/transaction.service';
import { AppError } from '../../../../shared/utils/errors';
import type { SyncBatchItem } from '../types';

export async function processBatchSync(userId: string, items: SyncBatchItem[]) {
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

  return { results };
}

async function processTransactionSync(userId: string, item: SyncBatchItem) {
  if (item.action === 'create') {
    await transactionService.createTransaction(userId, item.payload as never);
  } else if (item.action === 'update') {
    const id = String(item.payload.id ?? item.id);
    await transactionService.updateTransaction(userId, id, item.payload as never);
  } else if (item.action === 'delete') {
    const id = String(item.payload.id ?? item.id);
    const existing = await Transaction.findOne({ where: { id, userId } });
    if (existing) {
      await transactionService.deleteTransaction(userId, id);
    }
  }
}
