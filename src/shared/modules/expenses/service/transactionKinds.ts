import { balanceSign } from '@budgetbrain/detection-core';
import { AppError } from '@shared/errors';
import type { TransactionDirection, TransactionType } from '@database/models';

/**
 * Transaction types that count toward spending. Refunds are included so spending totals are
 * net of them: a ₹2,000 purchase refunded in full nets to zero spend in its category (spec §11),
 * while both records are kept. Transfers never count as spending or income (spec §12).
 */
export const NET_SPENDING_TYPES: readonly TransactionType[] = ['expense', 'refund'];

/** Signed contribution to spending: expenses add, refunds subtract. */
export function signedSpendingAmount(row: { type: string; amount: unknown }): number {
  const amount = Number(row.amount) || 0;
  return row.type === 'refund' ? -amount : amount;
}

/** Maps expense/refund rows to the `{ amount, currency }` shape convertAndSum expects, netting refunds. */
export function toNetSpendingRows<T extends { type: string; amount: unknown; currency?: string | null }>(
  rows: readonly T[]
): Array<{ amount: number; currency?: string | null }> {
  return rows
    .filter((row) => row.type === 'expense' || row.type === 'refund')
    .map((row) => ({ amount: signedSpendingAmount(row), currency: row.currency }));
}

/**
 * Change to an account balance caused by a transaction: income and refunds add, expenses
 * subtract, and transfer legs follow their direction.
 */
export function balanceDelta(type: TransactionType, amount: unknown, direction: TransactionDirection | null): number {
  try {
    return balanceSign(type, direction) * Number(amount);
  } catch {
    throw new AppError(400, 'A transfer must say whether money left (DEBIT) or entered (CREDIT) the account');
  }
}
