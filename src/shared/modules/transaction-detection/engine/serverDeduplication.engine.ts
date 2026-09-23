import crypto from 'crypto';
import type { NormalizedDetectedPayload } from '../transactionDetection.types';

/**
 * Computes deterministic SHA-256 fingerprint from stable transaction attributes.
 * Format: hash(userId:amount:currency:direction:transactionType:merchant:accountTail:refOrBucket)
 */
export function computeServerFingerprint(
  userId: string,
  payload: Pick<
    NormalizedDetectedPayload,
    | 'amount'
    | 'currency'
    | 'direction'
    | 'transactionType'
    | 'normalizedMerchant'
    | 'merchant'
    | 'accountTail'
    | 'referenceNumber'
    | 'transactionDate'
  >
): string {
  const normMerchant = (payload.normalizedMerchant || payload.merchant || 'unknown')
    .trim()
    .toLowerCase();
  const accTail = (payload.accountTail || 'none').trim();
  const refOrDate = (payload.referenceNumber || payload.transactionDate).trim();
  const curr = (payload.currency || 'INR').trim().toUpperCase();
  const amt = Number(payload.amount).toFixed(2);

  const rawSeed = `${userId}:${amt}:${curr}:${payload.direction}:${payload.transactionType}:${normMerchant}:${accTail}:${refOrDate}`;
  return crypto.createHash('sha256').update(rawSeed).digest('hex');
}
