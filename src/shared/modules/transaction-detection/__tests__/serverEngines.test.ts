import { describe, it, expect } from 'vitest';
import { computeFingerprint } from '@budgetbrain/detection-core';
import { validateServerDetectedPayload } from '../engine/serverValidation.engine';
import { computeServerFingerprint } from '../engine/serverDeduplication.engine';
import { detectedItemSchema } from '../transactionDetection.validator';
import { makeItem } from './fixtures';

const USER = '11111111-1111-1111-1111-111111111111';

describe('detectedItemSchema', () => {
  it('accepts a well-formed item', () => {
    expect(detectedItemSchema.safeParse(makeItem()).success).toBe(true);
  });

  it.each([
    ['a float amount', { amount: 1250 }],
    ['an unknown extra field (e.g. raw message text)', { body: 'Rs 1250 debited…' }],
    ['a legacy fingerprint', { dedupFingerprint: 'a'.repeat(64) }],
    ['a received time without offset', { receivedAt: '2026-09-23T10:00:00' }],
    ['a full account number', { accountTail: '123456789012' }],
  ])('rejects %s', (_label, change) => {
    expect(detectedItemSchema.safeParse({ ...makeItem(), ...change }).success).toBe(false);
  });
});

describe('validateServerDetectedPayload', () => {
  const today = '2026-09-24';

  it('accepts a valid item and returns minor units', () => {
    expect(validateServerDetectedPayload(makeItem(), today)).toEqual({ isValid: true, amountMinor: 125000 });
  });

  it.each([
    ['debit classified as income', { transactionType: 'income' as const }],
    ['credit classified as expense', { direction: 'CREDIT' as const }],
    ['a subtype that does not fit', { subtype: 'card_bill' as const }],
    ['more decimals than the currency allows', { amount: '12.345' }],
    ['a zero amount', { amount: '0.00' }],
    ['an unknown currency', { currency: 'XYZ' }],
    ['an impossible date', { transactionDate: '2026-02-30' }],
    ['a date too far in the future', { transactionDate: '2026-09-27' }],
    ['a date older than the accepted window', { transactionDate: '2025-01-01' }],
  ])('rejects %s', (_label, change) => {
    expect(validateServerDetectedPayload(makeItem(change), today).isValid).toBe(false);
  });

  it('accepts refunds and transfers with matching subtypes', () => {
    expect(validateServerDetectedPayload(makeItem({ direction: 'CREDIT', transactionType: 'refund', subtype: 'cashback' }), today).isValid).toBe(true);
    expect(validateServerDetectedPayload(makeItem({ transactionType: 'transfer', subtype: 'card_bill' }), today).isValid).toBe(true);
  });
});

describe('computeServerFingerprint', () => {
  it('matches what a device computes with core for the same user', () => {
    const item = makeItem();
    const device = computeFingerprint({
      userId: USER,
      institutionId: item.institutionId,
      accountTail: item.accountTail,
      amountMinor: 125000,
      currency: item.currency,
      direction: item.direction,
      referenceNumber: item.referenceNumber,
      transactionDate: item.transactionDate,
      receivedAt: item.receivedAt,
    });
    expect(computeServerFingerprint(USER, item, 125000)).toBe(device);
  });

  it('binds the identity to the authenticated user', () => {
    const item = makeItem();
    expect(computeServerFingerprint(USER, item, 125000)).not.toBe(
      computeServerFingerprint('22222222-2222-2222-2222-222222222222', item, 125000)
    );
  });
});
