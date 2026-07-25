import { Transaction } from '../../../../shared/models';
import * as transactionService from '../../expenses/service/transaction.service';
import { AppError } from '../../../shared/utils/errors';
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
      } else {
        throw new AppError(400, `Unsupported sync resource: ${item.resource}`, 'UNSUPPORTED_RESOURCE');
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
    await transactionService.createTransaction(userId, item.payload);
  } else if (item.action === 'update') {
    const id = item.payload.id ?? item.id;
    const { id: _id, ...data } = item.payload;
    await transactionService.updateTransaction(userId, id, data);
  } else if (item.action === 'delete') {
    const id = item.payload.id ?? item.id;
    const existing = await Transaction.findOne({ where: { id, userId } });
    if (existing) {
      await transactionService.deleteTransaction(userId, id);
    }
  }
}
