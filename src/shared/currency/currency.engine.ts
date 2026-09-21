import { ExchangeRate } from '@database/models';
import { logger } from '@shared/logging/logger';

const STALE_RATE_MS = 48 * 60 * 60 * 1000;

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
      const ageMs = now - new Date(row.updatedAt).getTime();
      if (ageMs > STALE_RATE_MS) {
        logger.warn(
          `Exchange rate ${row.fromCurrency}->${row.toCurrency} is stale (updated ${row.updatedAt.toISOString()}); serving last known rate`
        );
      }
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

/** Convert each row into `targetCurrency` then sum. Used instead of SQL SUM(amount) across mixed currencies. */
export async function convertAndSum(
  rows: Array<{ amount: unknown; currency?: string | null }>,
  targetCurrency: string
): Promise<number> {
  let total = 0;
  for (const row of rows) {
    const from = row.currency || targetCurrency;
    total += await convertAmount(Number(row.amount) || 0, from, targetCurrency);
  }
  return roundMoney(total);
}

async function upsertRatesToInrTable(ratesToInr: Record<string, number>): Promise<void> {
  const currencies = Object.keys(ratesToInr);

  for (const from of currencies) {
    for (const to of currencies) {
      if (from === to) continue;
      const rate = roundMoney(ratesToInr[from] / ratesToInr[to], 6);

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

export async function seedInitialExchangeRates(): Promise<void> {
  await upsertRatesToInrTable(BASELINE_RATES_TO_INR);
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * Frankfurter (ECB-sourced, no API key) doesn't publish AED — those currencies
 * stay pinned to BASELINE_RATES_TO_INR while everything the API does return
 * gets a live-derived INR rate for this upsert pass.
 */
export async function fetchAndUpsertLiveRates(): Promise<{ updated: string[]; skipped: string[] }> {
  const targets = SUPPORTED_CURRENCIES.filter((c) => c !== 'INR');
  const response = await fetch(
    `https://api.frankfurter.app/latest?from=INR&to=${targets.join(',')}`
  );

  if (!response.ok) {
    logger.error(`Frankfurter API request failed: ${response.status} ${response.statusText}`);
    throw new Error(`Frankfurter API request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as FrankfurterResponse;
  const liveRatesToInr: Record<string, number> = { INR: 1.0 };
  const updated: string[] = ['INR'];
  const skipped: string[] = [];

  for (const currency of targets) {
    // data.rates[currency] is "1 INR = X currency", so 1 currency = 1/X INR.
    const inrPerCurrency = data.rates[currency];
    if (typeof inrPerCurrency === 'number' && inrPerCurrency > 0) {
      liveRatesToInr[currency] = 1 / inrPerCurrency;
      updated.push(currency);
    } else {
      liveRatesToInr[currency] = BASELINE_RATES_TO_INR[currency] ?? 1.0;
      skipped.push(currency);
    }
  }

  await upsertRatesToInrTable(liveRatesToInr);
  return { updated, skipped };
}
