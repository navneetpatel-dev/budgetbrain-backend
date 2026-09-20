import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { FinancialAccount, IncomeAllocation } from '@database/models';
import { allocateIncomeToAccounts } from '../service/income.service';
import { AppError } from '@shared/errors';

async function createTestAccount(userId: string, overrides: Partial<{ balance: number; currency: string; name: string }> = {}) {
  return FinancialAccount.create({
    userId,
    name: overrides.name ?? 'Test Account',
    type: 'bank',
    balance: overrides.balance ?? 0,
    currency: overrides.currency ?? 'INR',
  } as any);
}

describe('allocateIncomeToAccounts', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('splits an income transaction evenly across two accounts and updates both balances', async () => {
    const user = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 1000 });
    const accountA = await createTestAccount(user.id, { balance: 100 });
    const accountB = await createTestAccount(user.id, { balance: 200 });

    const result = await allocateIncomeToAccounts(user.id, income.id, {
      allocations: [
        { financialAccountId: accountA.id, amount: 600 },
        { financialAccountId: accountB.id, amount: 400 },
      ],
    });

    expect(result).toHaveLength(2);
    await accountA.reload();
    await accountB.reload();
    expect(Number(accountA.balance)).toBe(700);
    expect(Number(accountB.balance)).toBe(600);
  });

  it('rejects when the allocation sum does not match the income amount', async () => {
    const user = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 1000 });
    const account = await createTestAccount(user.id);

    await expect(
      allocateIncomeToAccounts(user.id, income.id, {
        allocations: [{ financialAccountId: account.id, amount: 500 }],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'ALLOCATION_SUM_MISMATCH' } as Partial<AppError>);
  });

  it('rejects an account that belongs to a different user', async () => {
    const user = await createTestUser();
    const otherUser = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 500 });
    const foreignAccount = await createTestAccount(otherUser.id);

    await expect(
      allocateIncomeToAccounts(user.id, income.id, {
        allocations: [{ financialAccountId: foreignAccount.id, amount: 500 }],
      })
    ).rejects.toMatchObject({ statusCode: 404, code: 'ACCOUNT_NOT_FOUND' } as Partial<AppError>);
  });

  it('rejects an account whose currency does not match the income currency', async () => {
    const user = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 500, currency: 'INR' });
    const usdAccount = await createTestAccount(user.id, { currency: 'USD' });

    await expect(
      allocateIncomeToAccounts(user.id, income.id, {
        allocations: [{ financialAccountId: usdAccount.id, amount: 500 }],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'ALLOCATION_CURRENCY_MISMATCH' } as Partial<AppError>);
  });

  it('rejects allocating an expense transaction', async () => {
    const user = await createTestUser();
    const expense = await createTestTransaction(user.id, { type: 'expense', amount: 500 });
    const account = await createTestAccount(user.id);

    await expect(
      allocateIncomeToAccounts(user.id, expense.id, {
        allocations: [{ financialAccountId: account.id, amount: 500 }],
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'NOT_INCOME' } as Partial<AppError>);
  });

  it('cleanly replaces a prior allocation on re-run, reversing the old balance deltas first', async () => {
    const user = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 1000 });
    const accountA = await createTestAccount(user.id, { balance: 0 });
    const accountB = await createTestAccount(user.id, { balance: 0 });

    await allocateIncomeToAccounts(user.id, income.id, {
      allocations: [{ financialAccountId: accountA.id, amount: 1000 }],
    });
    await accountA.reload();
    expect(Number(accountA.balance)).toBe(1000);

    // Re-allocate the same income entirely to account B instead.
    await allocateIncomeToAccounts(user.id, income.id, {
      allocations: [{ financialAccountId: accountB.id, amount: 1000 }],
    });

    await accountA.reload();
    await accountB.reload();
    expect(Number(accountA.balance)).toBe(0);
    expect(Number(accountB.balance)).toBe(1000);

    const rows = await IncomeAllocation.findAll({ where: { transactionId: income.id } });
    expect(rows).toHaveLength(1);
  });

  it('does not double-increment a balance under concurrent re-allocation attempts (row locking)', async () => {
    const user = await createTestUser();
    const income = await createTestTransaction(user.id, { type: 'income', amount: 1000 });
    const account = await createTestAccount(user.id, { balance: 0 });

    // Fire the same allocation twice concurrently — row locking on the Transaction row
    // serializes these, and the clean-replace behavior means the end state is exactly
    // one allocation of 1000, not 2000.
    await Promise.all([
      allocateIncomeToAccounts(user.id, income.id, {
        allocations: [{ financialAccountId: account.id, amount: 1000 }],
      }),
      allocateIncomeToAccounts(user.id, income.id, {
        allocations: [{ financialAccountId: account.id, amount: 1000 }],
      }),
    ]);

    await account.reload();
    expect(Number(account.balance)).toBe(1000);
    const rows = await IncomeAllocation.findAll({ where: { transactionId: income.id } });
    expect(rows).toHaveLength(1);
  });
});
