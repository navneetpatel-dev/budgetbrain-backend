import * as transactionService from '@shared/modules/expenses/service/transaction.service';
import { IncomeSource, IncomeAllocation, FinancialAccount, Transaction, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
import type {
  CreateIncomeInput,
  CreateSourceInput,
  ListIncomeInput,
  UpdateIncomeInput,
  IncomeAllocationInput,
} from '../types';

const ALLOCATION_EPSILON = 0.01;

export async function getIncome(userId: string, id: string) {
  const transaction = await transactionService.getTransaction(userId, id);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transaction;
}

export async function listIncome(userId: string, filters: ListIncomeInput) {
  return transactionService.listTransactions(userId, { ...filters, type: 'income' });
}

export async function createIncome(userId: string, data: CreateIncomeInput) {
  return transactionService.createTransaction(userId, { ...data, type: 'income' });
}

export async function updateIncome(userId: string, id: string, data: UpdateIncomeInput) {
  const transaction = await transactionService.updateTransaction(userId, id, data);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transaction;
}

export async function deleteIncome(userId: string, id: string) {
  await transactionService.deleteTransaction(userId, id);
}

export async function duplicateIncome(userId: string, id: string) {
  const transaction = await transactionService.getTransaction(userId, id);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transactionService.duplicateTransaction(userId, id);
}

/**
 * Splits one income transaction's amount across one or more FinancialAccounts, incrementing
 * each account's balance atomically. Re-running this for the same transaction cleanly
 * REPLACES the prior allocation (reversing the old balance increments first) rather than
 * rejecting or stacking — simplest, least surprising behavior for "I made a mistake, let me
 * re-split this" without leaving stale rows or double-counted balances behind.
 *
 * Same-currency-only for MVP: an allocation targeting an account whose currency differs from
 * the income transaction's is rejected rather than silently converted or skipped.
 */
export async function allocateIncomeToAccounts(
  userId: string,
  incomeTransactionId: string,
  input: IncomeAllocationInput
) {
  const { allocations } = input;

  return sequelize.transaction(async (t) => {
    const transaction = await Transaction.findOne({
      where: { id: incomeTransactionId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!transaction) {
      throw new AppError(404, 'Income not found', 'INCOME_NOT_FOUND');
    }
    if (transaction.type !== 'income') {
      throw new AppError(400, 'Only income transactions can be allocated to accounts', 'NOT_INCOME');
    }

    const requestedTotal = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    if (Math.abs(requestedTotal - Number(transaction.amount)) > ALLOCATION_EPSILON) {
      throw new AppError(
        400,
        `Allocation total (${requestedTotal}) must equal the income amount (${transaction.amount})`,
        'ALLOCATION_SUM_MISMATCH'
      );
    }

    const accountIds = [...new Set(allocations.map((a) => a.financialAccountId))];
    const accounts = await FinancialAccount.findAll({
      where: { id: accountIds, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (accounts.length !== accountIds.length) {
      throw new AppError(404, 'One or more accounts were not found for this user', 'ACCOUNT_NOT_FOUND');
    }

    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    const currencyMismatches = allocations
      .map((a) => accountsById.get(a.financialAccountId)!)
      .filter((account) => account.currency !== transaction.currency)
      .map((account) => account.name);
    if (currencyMismatches.length > 0) {
      throw new AppError(
        400,
        `Account currency must match the income's currency (${transaction.currency}). Mismatched: ${[...new Set(currencyMismatches)].join(', ')}`,
        'ALLOCATION_CURRENCY_MISMATCH'
      );
    }

    // Reverse any prior allocation for this transaction before applying the new one, so a
    // re-run replaces cleanly instead of double-counting or leaving orphaned balance deltas.
    const existingAllocations = await IncomeAllocation.findAll({
      where: { transactionId: incomeTransactionId },
      transaction: t,
    });
    for (const existing of existingAllocations) {
      await FinancialAccount.decrement('balance', {
        by: Number(existing.amount),
        where: { id: existing.financialAccountId },
        transaction: t,
      });
    }
    await IncomeAllocation.destroy({ where: { transactionId: incomeTransactionId }, transaction: t });

    await IncomeAllocation.bulkCreate(
      allocations.map((a) => ({
        transactionId: incomeTransactionId,
        financialAccountId: a.financialAccountId,
        amount: a.amount,
      })),
      { transaction: t }
    );

    for (const a of allocations) {
      await FinancialAccount.increment('balance', {
        by: Number(a.amount),
        where: { id: a.financialAccountId },
        transaction: t,
      });
    }

    return IncomeAllocation.findAll({ where: { transactionId: incomeTransactionId }, transaction: t });
  });
}

export async function listSources(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 100);
  const { rows, count } = await IncomeSource.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('sources', rows, count, page, limit);
}

export async function createSource(userId: string, data: CreateSourceInput) {
  return IncomeSource.create({ userId, ...data });
}
