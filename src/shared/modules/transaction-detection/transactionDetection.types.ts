import type {
  DetectedTransactionDirection,
  DetectedTransactionSource,
  DetectedTransactionStatus,
  DetectedTransactionType,
} from '@database/models';

export interface NormalizedDetectedPayload {
  amount: number;
  currency?: string;
  direction: DetectedTransactionDirection;
  transactionType: DetectedTransactionType;
  merchant?: string | null;
  normalizedMerchant?: string | null;
  categoryId?: string | null;
  financialAccountId?: string | null;
  accountTail?: string | null;
  referenceNumber?: string | null;
  institutionName?: string | null;
  transactionDate: string; // YYYY-MM-DD
  confidence: number;
  dedupFingerprint: string;
  source: DetectedTransactionSource;
  status?: DetectedTransactionStatus;
  metadata?: Record<string, unknown> | null;
}

export interface SyncDetectedBatchRequest {
  items: NormalizedDetectedPayload[];
}

export interface SyncDetectedItemResult {
  fingerprint: string;
  status: 'created' | 'already_synced' | 'validation_error';
  detectedId?: string;
  transactionId?: string | null;
  error?: string;
}

export interface SyncDetectedBatchResponse {
  totalProcessed: number;
  createdCount: number;
  alreadySyncedCount: number;
  failedCount: number;
  results: SyncDetectedItemResult[];
}

export interface SyncStateResponse {
  latestSyncedTransactionDate: string | null;
  totalDetectedCount: number;
  pendingReviewCount: number;
}

export interface ConfirmDetectedTransactionInput {
  categoryId?: string | null;
  financialAccountId?: string | null;
  merchant?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  learnMerchantCategory?: boolean;
}

export interface MerchantRuleInput {
  merchant: string;
  categoryId: string;
}
