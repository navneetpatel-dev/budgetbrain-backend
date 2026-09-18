import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { getTransactionsSummary, listTransactions } from '../service/transaction.service';

describe('Transactions - filtered SQL summary (fixes paginated-list undercount bug)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('sums the true total across all matching rows, not just one page', async () => {
    const user = await createTestUser();

    // 25 expense rows — more than a typical 20-item page — plus 2 income rows.
    for (let i = 0; i < 25; i += 1) {
      await createTestTransaction(user.id, { type: 'expense', amount: 100 });
    }
    await createTestTransaction(user.id, { type: 'income', amount: 5000 });
    await createTestTransaction(user.id, { type: 'income', amount: 3000 });

    const summary = await getTransactionsSummary(user.id, { limit: 20, page: 1 });

    expect(summary.totalExpense).toBe(2500);
    expect(summary.totalIncome).toBe(8000);
  });

  it('honors search filters identically to the list query (search matches searchVector)', async () => {
    const user = await createTestUser();
    const uniqueMerchant = `SummaryTestMerchant-${Date.now()}`;

    // createTestTransaction bypasses transactionService.createTransaction, so searchVector
    // (normally built from notes/merchant/amount) must be set explicitly here to match what
    // the real create path would produce.
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 111,
      merchant: uniqueMerchant,
      searchVector: uniqueMerchant,
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 999,
      merchant: 'Unrelated Merchant',
      searchVector: 'Unrelated Merchant',
    });

    const summary = await getTransactionsSummary(user.id, { search: uniqueMerchant });
    expect(summary.totalExpense).toBe(111);
  });

  it('ignores a `type` filter so one call always returns both totals', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 50 });
    await createTestTransaction(user.id, { type: 'income', amount: 200 });

    const summary = await getTransactionsSummary(user.id, { type: 'expense' });
    expect(summary.totalExpense).toBe(50);
    expect(summary.totalIncome).toBe(200);
  });

  it('embeds the same summary in listTransactions (single round trip for web/mobile)', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 42 });

    const result = await listTransactions(user.id, {});
    expect(result.summary.totalExpense).toBe(42);
    expect(result.summary.totalIncome).toBe(0);
  });

  it('returns zero totals (not null/NaN) for a user with no transactions', async () => {
    const user = await createTestUser();
    const summary = await getTransactionsSummary(user.id, {});
    expect(summary.totalExpense).toBe(0);
    expect(summary.totalIncome).toBe(0);
  });
});
