import { describe, it, expect, beforeAll } from 'vitest';
import { FinancialAccount } from '@database/models';
import { setupTestDb, createTestUser, createTestTransaction, createTestCategory } from '@testHelpers';
import {
  createTransaction,
  deleteTransaction,
  getCategoryBreakdown,
  getTotalExpenses,
  getTotalIncome,
  getTransactionsSummary,
  updateTransaction,
} from '../service/expenses.service';
import { createBudget, getBudget } from '@shared/modules/budgets/service/budget.service';
import { transactionSchema } from '../expenses.validator';

/**
 * Refunds and transfers (implementation plan T1.1, T1.2; spec §8–12): a refund is kept apart
 * from income and nets against spending; a transfer counts as neither.
 */
describe('refund and transfer transactions', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  async function seedMixedUser() {
    const user = await createTestUser({ currency: 'INR' });
    const shopping = await createTestCategory(user.id, { name: 'Shopping' });
    const food = await createTestCategory(user.id, { name: 'Food' });
    await createTestTransaction(user.id, { type: 'expense', amount: 2000, categoryId: shopping.id });
    await createTestTransaction(user.id, { type: 'expense', amount: 300, categoryId: food.id });
    await createTestTransaction(user.id, { type: 'refund', amount: 500, categoryId: shopping.id });
    await createTestTransaction(user.id, { type: 'income', amount: 50000 });
    await createTestTransaction(user.id, { type: 'transfer', amount: 10000, direction: 'DEBIT' });
    await createTestTransaction(user.id, { type: 'transfer', amount: 10000, direction: 'CREDIT' });
    return { user, shopping, food };
  }

  it('keeps refunds out of income and transfers out of both totals', async () => {
    const { user } = await seedMixedUser();
    expect(await getTotalIncome(user.id, user)).toBe(50000);
    expect(await getTotalExpenses(user.id, user)).toBe(1800); // 2000 + 300 - 500
  });

  it('nets refunds in the filtered list summary', async () => {
    const { user } = await seedMixedUser();
    const summary = await getTransactionsSummary(user.id, {});
    expect(summary).toEqual({ totalExpense: 1800, totalIncome: 50000 });
  });

  it('nets refunds within their category in the breakdown', async () => {
    const { user, shopping, food } = await seedMixedUser();
    const breakdown = await getCategoryBreakdown(user.id, user, 10);
    const byId = new Map(breakdown.map((row) => [row.categoryId, row.total]));
    expect(byId.get(shopping.id)).toBe(1500);
    expect(byId.get(food.id)).toBe(300);
    expect(byId.has(null)).toBe(false); // transfers have no category and don't appear
  });

  it('nets refunds against a category budget', async () => {
    const { user, shopping } = await seedMixedUser();
    const budget = await createBudget(user.id, {
      name: 'Shopping',
      amount: 3000,
      type: 'monthly',
      categoryId: shopping.id,
      startDate: new Date().toISOString().slice(0, 10),
    } as never);
    const enriched = await getBudget(user.id, budget.id);
    expect(enriched.spent).toBe(1500);
  });

  describe('account balances', () => {
    async function accountFor(userId: string, balance: number) {
      return FinancialAccount.create({
        userId,
        name: 'Savings',
        type: 'bank',
        balance,
        currency: 'INR',
        isActive: true,
      } as never);
    }

    it('adds refunds and follows the direction of transfer legs', async () => {
      const user = await createTestUser();
      const account = await accountFor(user.id, 1000);
      const base = { currency: 'INR', date: '2026-09-23', financialAccountId: account.id };

      await createTransaction(user.id, { ...base, type: 'refund', amount: 200 } as never);
      await account.reload();
      expect(Number(account.balance)).toBe(1200);

      const out = await createTransaction(user.id, { ...base, type: 'transfer', direction: 'DEBIT', amount: 700 } as never);
      await account.reload();
      expect(Number(account.balance)).toBe(500);

      await createTransaction(user.id, { ...base, type: 'transfer', direction: 'CREDIT', amount: 50 } as never);
      await account.reload();
      expect(Number(account.balance)).toBe(550);

      await updateTransaction(user.id, out!.id, { amount: 600 });
      await account.reload();
      expect(Number(account.balance)).toBe(650);

      await deleteTransaction(user.id, out!.id);
      await account.reload();
      expect(Number(account.balance)).toBe(1250);
    });

    it('records the source and new columns on create', async () => {
      const user = await createTestUser();
      const expense = await createTransaction(user.id, {
        type: 'expense',
        amount: 100,
        currency: 'INR',
        date: '2026-09-23',
        merchant: 'Shop',
        categoryId: (await createTestCategory(user.id)).id,
      } as never);
      const refund = await createTransaction(
        user.id,
        {
          type: 'refund',
          subtype: 'reversal',
          amount: 100,
          currency: 'INR',
          date: '2026-09-24',
          refundOfTransactionId: expense!.id,
        } as never,
        { source: 'detected' }
      );
      expect(refund!.source).toBe('detected');
      expect(refund!.subtype).toBe('reversal');
      expect(refund!.refundOfTransactionId).toBe(expense!.id);
      expect(expense!.source).toBe('manual');
    });

    it("refuses a refund of another user's expense", async () => {
      const owner = await createTestUser();
      const other = await createTestUser();
      const expense = await createTestTransaction(owner.id, { type: 'expense', amount: 100 });
      await expect(
        createTransaction(other.id, {
          type: 'refund',
          amount: 100,
          currency: 'INR',
          date: '2026-09-24',
          refundOfTransactionId: expense.id,
        } as never)
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('validation', () => {
    const base = { amount: 10, currency: 'INR', date: '2026-09-23' };

    it('requires a direction for transfers and rejects it elsewhere', () => {
      expect(transactionSchema.safeParse({ ...base, type: 'transfer' }).success).toBe(false);
      expect(transactionSchema.safeParse({ ...base, type: 'transfer', direction: 'DEBIT' }).success).toBe(true);
      expect(transactionSchema.safeParse({ ...base, type: 'income', direction: 'CREDIT' }).success).toBe(false);
    });

    it('only allows subtypes that fit the type', () => {
      expect(transactionSchema.safeParse({ ...base, type: 'refund', subtype: 'cashback' }).success).toBe(true);
      expect(transactionSchema.safeParse({ ...base, type: 'refund', subtype: 'card_bill' }).success).toBe(false);
      expect(
        transactionSchema.safeParse({ ...base, type: 'transfer', direction: 'DEBIT', subtype: 'card_bill' }).success
      ).toBe(true);
    });

    it('does not require merchant or category for refunds and transfers', () => {
      expect(transactionSchema.safeParse({ ...base, type: 'refund' }).success).toBe(true);
      expect(transactionSchema.safeParse({ ...base, type: 'expense' }).success).toBe(false);
    });
  });
});
