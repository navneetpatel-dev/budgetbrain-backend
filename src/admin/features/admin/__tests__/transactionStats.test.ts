import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { convertAmount } from '@shared/currency/currency.engine';
import { getTransactionStats } from '../admin.service';

describe('getTransactionStats', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('sums multi-currency expense volume in INR, matching convertAmount exactly', async () => {
    const user = await createTestUser({ currency: 'INR' });
    await createTestTransaction(user.id, { type: 'expense', amount: 1000, currency: 'INR' });
    await createTestTransaction(user.id, { type: 'expense', amount: 50, currency: 'USD' });
    // Income rows must be excluded from the expense-volume total.
    await createTestTransaction(user.id, { type: 'income', amount: 99999, currency: 'INR' });

    const before = await getTransactionStats();

    await createTestTransaction(user.id, { type: 'expense', amount: 200, currency: 'INR' });
    await createTestTransaction(user.id, { type: 'expense', amount: 20, currency: 'USD' });

    const after = await getTransactionStats();

    expect(after.totalTransactions).toBe(before.totalTransactions + 2);

    const addedInInr = await convertAmount(200, 'INR', 'INR');
    const addedUsdInInr = await convertAmount(20, 'USD', 'INR');
    const expectedDelta = Math.round((addedInInr + addedUsdInInr) * 100) / 100;
    const actualDelta = Math.round((after.totalExpenseVolume - before.totalExpenseVolume) * 100) / 100;
    expect(actualDelta).toBe(expectedDelta);
  });
});
