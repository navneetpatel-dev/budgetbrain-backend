import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_CURRENCIES,
  getExchangeRate,
  convertAmount,
  roundMoney,
  isSupportedCurrency,
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
});
