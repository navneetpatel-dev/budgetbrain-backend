import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { getTransactionsSummary } from '../service/expenses.service';
import { convertAmount } from '@shared/currency/currency.engine';

describe('Transactions summary converts mixed currencies', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('converts foreign-currency expenses into the user base currency before summing', async () => {
    const user = await createTestUser({ currency: 'INR' });
    await createTestTransaction(user.id, { type: 'expense', amount: 8300, currency: 'INR' });
    await createTestTransaction(user.id, { type: 'expense', amount: 100, currency: 'USD' });

    const summary = await getTransactionsSummary(user.id, {});
    const usdInInr = await convertAmount(100, 'USD', 'INR');
    expect(summary.totalExpense).toBe(8300 + usdInInr);
  });
});
