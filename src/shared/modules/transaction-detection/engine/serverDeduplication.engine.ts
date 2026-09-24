import { computeFingerprint } from '@budgetbrain/detection-core';
import type { DetectedItemInput } from '../transactionDetection.types';

/**
 * The server's own fingerprint for a detected item (spec §19: the backend is the final
 * authority for uniqueness). It uses the same core function as the device, but with the
 * authenticated user id, so a client can't choose the identity of what it inserts. When the
 * client's fingerprint differs, the server's wins and the mismatch is counted by the caller.
 */
export function computeServerFingerprint(userId: string, item: DetectedItemInput, amountMinor: number): string {
  return computeFingerprint({
    userId,
    institutionId: item.institutionId,
    accountTail: item.accountTail,
    amountMinor,
    currency: item.currency,
    direction: item.direction,
    referenceNumber: item.referenceNumber,
    transactionDate: item.transactionDate,
    receivedAt: item.receivedAt,
  });
}
