import { formatMinorToDecimal, parseDecimalToMinor } from '@budgetbrain/detection-core';
import type { DetectedTransaction } from '@database/models';
import type { DetectedTransactionDto } from '../transactionDetection.types';

type WithIncludes = DetectedTransaction & {
  category?: { name: string } | null;
  financialAccount?: { name: string } | null;
};

/**
 * Maps a detected-transaction row to its API shape (plan task T1.10, gap P0-7).
 * Postgres returns DECIMAL as a string; it is normalized to the currency's canonical decimal
 * string, and category/account names are flattened so clients never dig into includes.
 */
export function toDetectedDto(row: DetectedTransaction): DetectedTransactionDto {
  const r = row as WithIncludes;
  return {
    id: r.id,
    amount: formatMinorToDecimal(parseDecimalToMinor(String(r.amount), r.currency), r.currency),
    currency: r.currency,
    direction: r.direction,
    transactionType: r.transactionType,
    subtype: r.subtype ?? null,
    paymentMethod: r.paymentMethod ?? null,
    merchant: r.normalizedMerchant ?? r.merchant ?? null,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    financialAccountId: r.financialAccountId,
    financialAccountName: r.financialAccount?.name ?? null,
    accountTail: r.accountTail,
    referenceNumber: r.referenceNumber,
    institutionId: r.institutionId ?? null,
    transactionDate: String(r.transactionDate).slice(0, 10),
    confidenceTier: r.confidenceTier ?? null,
    reviewReason: r.reviewReason ?? null,
    status: r.status,
    source: r.source,
    createdTransactionId: r.createdTransactionId,
    createdAt: new Date(r.createdAt).toISOString(),
  };
}
