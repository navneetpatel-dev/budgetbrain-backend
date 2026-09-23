import { describe, it, expect } from 'vitest';
import { computeServerFingerprint } from '../engine/serverDeduplication.engine';

describe('serverDeduplication.engine', () => {
  const userId = '11111111-1111-1111-1111-111111111111';

  it('produces identical fingerprints for identical inputs', () => {
    const payload1 = {
      amount: 450.5,
      currency: 'INR',
      direction: 'DEBIT' as const,
      transactionType: 'expense' as const,
      merchant: 'Swiggy',
      normalizedMerchant: 'Swiggy',
      accountTail: '1234',
      referenceNumber: 'UPI12345678',
      transactionDate: '2026-09-23',
    };

    const payload2 = { ...payload1 };

    const fp1 = computeServerFingerprint(userId, payload1);
    const fp2 = computeServerFingerprint(userId, payload2);

    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });

  it('produces different fingerprints for different amounts or dates', () => {
    const base = {
      currency: 'INR',
      direction: 'DEBIT' as const,
      transactionType: 'expense' as const,
      merchant: 'Swiggy',
      normalizedMerchant: 'Swiggy',
      accountTail: '1234',
      referenceNumber: 'UPI12345678',
      transactionDate: '2026-09-23',
    };

    const fp1 = computeServerFingerprint(userId, { ...base, amount: 100 });
    const fp2 = computeServerFingerprint(userId, { ...base, amount: 200 });

    expect(fp1).not.toBe(fp2);
  });

  it('is case-insensitive for merchant normalization', () => {
    const base = {
      amount: 500,
      currency: 'INR',
      direction: 'DEBIT' as const,
      transactionType: 'expense' as const,
      accountTail: '1234',
      referenceNumber: 'UPI9999',
      transactionDate: '2026-09-23',
    };

    const fp1 = computeServerFingerprint(userId, { ...base, merchant: 'ZOMATO', normalizedMerchant: 'Zomato' });
    const fp2 = computeServerFingerprint(userId, { ...base, merchant: 'zomato', normalizedMerchant: 'zomato' });

    expect(fp1).toBe(fp2);
  });
});
