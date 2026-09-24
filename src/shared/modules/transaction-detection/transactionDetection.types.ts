import type { z } from 'zod';
import type { PackKillSwitch, SyncItemResult } from '@budgetbrain/detection-core';
import type {
  confirmDetectedTransactionSchema,
  createMerchantRuleSchema,
  detectedItemSchema,
  detectionSettingsSchema,
  ingestMessageSchema,
  listDetectedQuerySchema,
  syncDetectedBatchSchema,
  updateMerchantRuleSchema,
} from './transactionDetection.validator';

export type DetectedItemInput = z.infer<typeof detectedItemSchema>;
export type SyncDetectedBatchRequest = z.infer<typeof syncDetectedBatchSchema>;
export type ConfirmDetectedTransactionInput = z.infer<typeof confirmDetectedTransactionSchema>;
export type MerchantRuleInput = z.infer<typeof createMerchantRuleSchema>;
export type DetectionSettingsInput = z.infer<typeof detectionSettingsSchema>;
export type ListDetectedQuery = z.infer<typeof listDetectedQuerySchema>;
export type IngestInput = z.infer<typeof ingestMessageSchema>;
export type UpdateMerchantRuleInput = z.infer<typeof updateMerchantRuleSchema>;

/** What happened to a pasted message or email (plan T6.2). Never echoes the text. */
export interface IngestResponse {
  status: 'created' | 'needs_review' | 'already_synced' | 'ignored' | 'validation_error';
  /** Where and why parsing stopped, for `ignored` and `validation_error`. */
  stage: string | null;
  reason: string | null;
  detected: DetectedTransactionDto | null;
}

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
  /** Where detections came from and when each source last sent one (web status page, T6.4). */
  sources: { source: string; count: number; lastReceivedAt: string }[];
}

/** Runtime switches clients read before processing (plan task T1.16, interim until T4.6). */
export interface DetectionConfigResponse {
  enabled: boolean;
  autoCreateEnabled: boolean;
  minAppVersion: string | null;
  /** The user's own preference; the server applies it too. */
  autoAddHighConfidence: boolean;
  /** Active kill switches; core applies them on top of the pack's (plan T4.6). */
  killSwitches: PackKillSwitch[];
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
