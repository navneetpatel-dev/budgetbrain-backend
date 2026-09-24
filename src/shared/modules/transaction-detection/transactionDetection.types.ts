import type { z } from 'zod';
import type { SyncItemResult } from '@budgetbrain/detection-core';
import type {
  confirmDetectedTransactionSchema,
  createMerchantRuleSchema,
  detectedItemSchema,
  detectionSettingsSchema,
  listDetectedQuerySchema,
  syncDetectedBatchSchema,
} from './transactionDetection.validator';

export type DetectedItemInput = z.infer<typeof detectedItemSchema>;
export type SyncDetectedBatchRequest = z.infer<typeof syncDetectedBatchSchema>;
export type ConfirmDetectedTransactionInput = z.infer<typeof confirmDetectedTransactionSchema>;
export type MerchantRuleInput = z.infer<typeof createMerchantRuleSchema>;
export type DetectionSettingsInput = z.infer<typeof detectionSettingsSchema>;
export type ListDetectedQuery = z.infer<typeof listDetectedQuerySchema>;

export interface SyncDetectedBatchResponse {
  totalProcessed: number;
  createdCount: number;
  needsReviewCount: number;
  alreadySyncedCount: number;
  failedCount: number;
  /** One result per submitted item, in the same order, keyed by the client's id. */
  results: SyncItemResult[];
}

export interface SyncStateResponse {
  latestSyncedTransactionDate: string | null;
  totalDetectedCount: number;
  pendingReviewCount: number;
}

/** Runtime switches clients read before processing (plan task T1.16, interim until T4.6). */
export interface DetectionConfigResponse {
  enabled: boolean;
  autoCreateEnabled: boolean;
  minAppVersion: string | null;
  /** The user's own preference; the server applies it too. */
  autoAddHighConfidence: boolean;
}

/**
 * Detected transaction as returned to clients (plan task T1.10). Amounts are decimal strings;
 * clients parse them with core `parseMoney` (gap P0-7).
 */
export interface DetectedTransactionDto {
  id: string;
  amount: string;
  currency: string;
  direction: 'DEBIT' | 'CREDIT';
  transactionType: 'expense' | 'income' | 'refund' | 'transfer';
  subtype: string | null;
  paymentMethod: string | null;
  merchant: string | null;
  categoryId: string | null;
  categoryName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  accountTail: string | null;
  referenceNumber: string | null;
  institutionId: string | null;
  transactionDate: string;
  confidenceTier: 'high' | 'medium' | 'low' | null;
  reviewReason: string | null;
  status: string;
  source: string;
  createdTransactionId: string | null;
  createdAt: string;
}
