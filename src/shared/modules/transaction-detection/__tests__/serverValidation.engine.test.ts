import { describe, it, expect } from 'vitest';
import { validateServerDetectedPayload } from '../engine/serverValidation.engine';
import type { NormalizedDetectedPayload } from '../transactionDetection.types';

describe('serverValidation.engine', () => {
  const validPayload: NormalizedDetectedPayload = {
    amount: 1500,
    currency: 'INR',
    direction: 'DEBIT',
    transactionType: 'expense',
    merchant: 'Amazon',
    normalizedMerchant: 'Amazon',
    transactionDate: '2026-09-23',
    confidence: 0.9,
    dedupFingerprint: 'a'.repeat(64),
    source: 'android_sms',
  };

  it('validates a correct payload successfully', () => {
    const res = validateServerDetectedPayload(validPayload);
    expect(res.isValid).toBe(true);
  });

  it('rejects zero or negative amount', () => {
    const resZero = validateServerDetectedPayload({ ...validPayload, amount: 0 });
    expect(resZero.isValid).toBe(false);

    const resNeg = validateServerDetectedPayload({ ...validPayload, amount: -50 });
    expect(resNeg.isValid).toBe(false);
  });

  it('rejects dates in the distant future', () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = validateServerDetectedPayload({ ...validPayload, transactionDate: futureDate });
    expect(res.isValid).toBe(false);
  });
});
