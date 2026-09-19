import { describe, it, expect, vi, afterEach } from 'vitest';
import { ExchangeRate } from '@database/models';
import {
  SUPPORTED_CURRENCIES,
  getExchangeRate,
  convertAmount,
  roundMoney,
  isSupportedCurrency,
  fetchAndUpsertLiveRates,
} from '../currency.engine';

describe('Currency Engine', () => {
  it('identifies all 6 supported currencies', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']);
    expect(isSupportedCurrency('INR')).toBe(true);
    expect(isSupportedCurrency('usd')).toBe(true);
    expect(isSupportedCurrency('JPY')).toBe(false);
  });

  it('returns 1.0 when converting to same currency', async () => {
    const rate = await getExchangeRate('USD', 'USD');
    expect(rate).toBe(1.0);
    const converted = await convertAmount(100, 'USD', 'USD');
    expect(converted).toBe(100);
  });

  it('converts correctly between currencies using baseline rates', async () => {
    // 1 USD = 83.5 INR
    const rateUsdToInr = await getExchangeRate('USD', 'INR');
    expect(rateUsdToInr).toBeCloseTo(83.5, 1);

    const inr = await convertAmount(10, 'USD', 'INR');
    expect(inr).toBe(835);
  });

  it('rounds money amounts to 2 decimal places by default', () => {
    expect(roundMoney(12.3456)).toBe(12.35);
    expect(roundMoney(12.3444)).toBe(12.34);
    expect(roundMoney(0.001)).toBe(0);
  });

  describe('fetchAndUpsertLiveRates', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('upserts rates for currencies the API returns and skips AED (not published by the provider)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            amount: 1,
            base: 'INR',
            date: '2026-01-01',
            // 1 INR = 0.01 USD  =>  1 USD = 100 INR
            rates: { USD: 0.01, EUR: 0.009, GBP: 0.0078, SGD: 0.0133 },
          }),
        })
      );

      const { updated, skipped } = await fetchAndUpsertLiveRates();
      expect(updated.sort()).toEqual(['EUR', 'GBP', 'INR', 'SGD', 'USD'].sort());
      expect(skipped).toEqual(['AED']);

      const row = await ExchangeRate.findOne({ where: { fromCurrency: 'USD', toCurrency: 'INR' } });
      expect(row).not.toBeNull();
      expect(Number(row!.rate)).toBeCloseTo(100, 5);

      // Cache must be invalidated so a fresh read reflects the new rate immediately.
      const rate = await getExchangeRate('USD', 'INR');
      expect(rate).toBeCloseTo(100, 5);
    });

    it('throws and does not touch the DB when the API request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }));

      const before = await ExchangeRate.findOne({ where: { fromCurrency: 'USD', toCurrency: 'INR' } });

      await expect(fetchAndUpsertLiveRates()).rejects.toThrow('Frankfurter API request failed');

      const after = await ExchangeRate.findOne({ where: { fromCurrency: 'USD', toCurrency: 'INR' } });
      expect(after?.rate).toBe(before?.rate);
    });
  });
});
