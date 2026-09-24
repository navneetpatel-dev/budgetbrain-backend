import { computeFingerprint, parseDecimalToMinor } from '@budgetbrain/detection-core';
import type { DetectedItemInput } from '../transactionDetection.types';

/** A valid detected item; override any field. */
export function makeItem(overrides: Partial<DetectedItemInput> = {}): DetectedItemInput {
  const base: DetectedItemInput = {
    clientId: 'c1',
    amount: '1250.00',
    currency: 'INR',
    direction: 'DEBIT',
    transactionType: 'expense',
    subtype: null,
    paymentMethod: 'upi',
    institutionId: 'in.hdfc_bank',
    accountTail: '1234',
    referenceNumber: '425612345678',
    merchantName: 'Swiggy',
    merchantId: 'm.swiggy',
    taxonomyCode: null,
    categoryId: null,
    categorySource: null,
    financialAccountId: null,
    transactionDate: '2026-09-23',
    receivedAt: '2026-09-23T10:00:00+05:30',
    evidence: {
      templateMatched: false,
      institutionVerified: true,
      amountRoleUnique: true,
      directionUnambiguous: true,
      merchantKnown: true,
      dateExtracted: true,
      referencePresent: true,
      merchantFuzzy: false,
    },
    confidenceTier: 'high',
    dedupFingerprint: 'v2_' + '0'.repeat(64),
    source: 'android_sms',
  };
  return { ...base, ...overrides };
}

/** Same as makeItem, with the fingerprint a real device would compute for this user. */
export function makeSignedItem(userId: string, overrides: Partial<DetectedItemInput> = {}): DetectedItemInput {
  const item = makeItem(overrides);
  return {
    ...item,
    dedupFingerprint: computeFingerprint({
      userId,
      institutionId: item.institutionId,
      accountTail: item.accountTail,
      amountMinor: parseDecimalToMinor(item.amount, item.currency),
      currency: item.currency,
      direction: item.direction,
      referenceNumber: item.referenceNumber,
      transactionDate: item.transactionDate,
      receivedAt: item.receivedAt,
    }),
  };
}
