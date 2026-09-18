import { ExchangeRate } from '@database/models';

export const SUPPORTED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// Baseline exchange rates against INR (1 unit of currency = X INR)
const BASELINE_RATES_TO_INR: Record<string, number> = {
  INR: 1.0,
  USD: 83.5,
  EUR: 91.0,
  GBP: 108.0,
  AED: 22.74,
  SGD: 62.5,
};

let inMemoryRateCache: Map<string, number> | null = null;
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function roundMoney(amount: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

export function isSupportedCurrency(curr: string): curr is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(curr.toUpperCase() as SupportedCurrency);
}

export async function getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return 1.0;

  const cacheKey = `${from}_${to}`;
  const now = Date.now();

  if (inMemoryRateCache && now - lastCacheRefresh < CACHE_TTL_MS) {
    const cached = inMemoryRateCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  // Load from database
  try {
    const dbRows = await ExchangeRate.findAll();
    if (!inMemoryRateCache) inMemoryRateCache = new Map();

    for (const row of dbRows) {
      inMemoryRateCache.set(`${row.fromCurrency}_${row.toCurrency}`, Number(row.rate));
    }
    lastCacheRefresh = now;

    const fromDb = inMemoryRateCache.get(cacheKey);
    if (fromDb !== undefined) return fromDb;
  } catch (err) {
    console.warn('[CurrencyEngine] Failed to load rates from DB, using fallback baselines:', err);
  }

  // Calculate from baseline rates relative to INR
  const fromToInr = BASELINE_RATES_TO_INR[from] ?? 1.0;
  const toToInr = BASELINE_RATES_TO_INR[to] ?? 1.0;
  const derivedRate = fromToInr / toToInr;

  return derivedRate;
}

export async function convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<number> {
  if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
    return roundMoney(amount);
  }

  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return roundMoney(amount * rate);
}

export async function seedInitialExchangeRates(): Promise<void> {
  const currencies = Object.keys(BASELINE_RATES_TO_INR);

  for (const from of currencies) {
    for (const to of currencies) {
      if (from === to) continue;
      const rate = roundMoney(BASELINE_RATES_TO_INR[from] / BASELINE_RATES_TO_INR[to], 6);

      const existing = await ExchangeRate.findOne({
        where: { fromCurrency: from, toCurrency: to },
      });

      if (existing) {
        await existing.update({ rate });
      } else {
        await ExchangeRate.create({
          fromCurrency: from,
          toCurrency: to,
          rate,
        });
      }
    }
  }

  inMemoryRateCache = null;
}
