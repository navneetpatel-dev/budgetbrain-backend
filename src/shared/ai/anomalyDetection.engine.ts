export interface TransactionForAnomaly {
  id: string;
  amount: number;
  merchant: string | null;
  categoryId: string | null;
  categoryName?: string;
  date: Date;
}

export interface RecurringSeriesForAnomaly {
  id: string;
  merchant: string;
  amount: number;
  cadence: string;
}

export interface DetectedAnomaly {
  type: 'spending_spike' | 'duplicate_expense' | 'subscription_cost_increase';
  transactionId?: string;
  recurringSeriesId?: string;
  merchant?: string;
  amount?: number;
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

/**
 * 1. Duplicate expense detection:
 * Flags pairs of transactions with the exact same merchant and amount within `windowHours` (default: 48 hours).
 */
export function detectDuplicateExpenses(
  transactions: TransactionForAnomaly[],
  windowHours = 48
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const windowMs = windowHours * 60 * 60 * 1000;
  const flaggedIds = new Set<string>();

  // Sort by date ascending
  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  for (let i = 0; i < sorted.length; i++) {
    const t1 = sorted[i];
    if (!t1.merchant) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const t2 = sorted[j];
      if (!t2.merchant) continue;
      const timeDiff = Math.abs(t2.date.getTime() - t1.date.getTime());
      if (timeDiff > windowMs) break; // Beyond window

      if (
        t1.merchant.trim().toLowerCase() === t2.merchant.trim().toLowerCase() &&
        Math.abs(t1.amount - t2.amount) < 0.01 &&
        !flaggedIds.has(t2.id)
      ) {
        flaggedIds.add(t2.id);
        const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60));
        anomalies.push({
          type: 'duplicate_expense',
          transactionId: t2.id,
          merchant: t2.merchant,
          amount: t2.amount,
          severity: 'medium',
          reason: `Possible duplicate charge of ₹${t2.amount.toFixed(2)} at ${t2.merchant} (${hoursDiff}h after previous charge)`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * 2. Category spending spike detection:
 * Detects transactions > stdDevMultiplier (default 2.5) standard deviations above the mean for their category.
 * Requires at least 3 transactions in the category to establish a baseline.
 */
export function detectSpendingSpikes(
  transactions: TransactionForAnomaly[],
  stdDevMultiplier = 2.5
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  const byCategory = new Map<string, TransactionForAnomaly[]>();
  for (const t of transactions) {
    const catKey = t.categoryId || 'uncategorized';
    const list = byCategory.get(catKey) ?? [];
    list.push(t);
    byCategory.set(catKey, list);
  }

  for (const [, catTxs] of byCategory) {
    if (catTxs.length < 3) continue;

    for (const t of catTxs) {
      const others = catTxs.filter((x) => x.id !== t.id);
      if (others.length < 2) continue;

      const otherAmounts = others.map((x) => x.amount);
      const mean = otherAmounts.reduce((a, b) => a + b, 0) / otherAmounts.length;
      const variance =
        otherAmounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (otherAmounts.length - 1);
      const stdDev = Math.sqrt(variance);

      const threshold = stdDev > 0 ? mean + stdDevMultiplier * stdDev : mean * 2.5;

      if (t.amount > threshold && t.amount >= mean * 1.75) {
        const factor = (t.amount / mean).toFixed(1);
        const catName = t.categoryName || 'this category';
        anomalies.push({
          type: 'spending_spike',
          transactionId: t.id,
          merchant: t.merchant ?? undefined,
          amount: t.amount,
          severity: t.amount > mean * 4 ? 'high' : 'medium',
          reason: `Unusual spending spike: ₹${t.amount.toFixed(2)} is ${factor}x above your average (₹${mean.toFixed(0)}) for ${catName}`,
        });
      }
    }
  }

  return anomalies;
}


/**
 * 3. Subscription cost increase detection:
 * Matches recent transactions against known active recurring series and flags if the transaction amount exceeds
 * the expected series amount by > 5%.
 */
export function detectSubscriptionIncreases(
  transactions: TransactionForAnomaly[],
  recurringSeries: RecurringSeriesForAnomaly[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  if (!recurringSeries.length || !transactions.length) return anomalies;

  const seriesByMerchant = new Map<string, RecurringSeriesForAnomaly>();
  for (const s of recurringSeries) {
    seriesByMerchant.set(s.merchant.trim().toLowerCase(), s);
  }

  for (const t of transactions) {
    if (!t.merchant) continue;
    const series = seriesByMerchant.get(t.merchant.trim().toLowerCase());
    if (!series) continue;

    const nominal = series.amount;
    const delta = t.amount - nominal;
    const percentIncrease = nominal > 0 ? (delta / nominal) * 100 : 0;

    if (percentIncrease > 5) {
      anomalies.push({
        type: 'subscription_cost_increase',
        transactionId: t.id,
        recurringSeriesId: series.id,
        merchant: series.merchant,
        amount: t.amount,
        severity: percentIncrease > 25 ? 'high' : 'medium',
        reason: `Subscription price increase detected: ${series.merchant} charged ₹${t.amount.toFixed(2)} (${Math.round(percentIncrease)}% higher than your ₹${nominal.toFixed(2)} regular bill)`,
      });
    }
  }

  return anomalies;
}

/**
 * Comprehensive anomaly detection runner.
 */
export function runAnomalyDetection(
  transactions: TransactionForAnomaly[],
  recurringSeries: RecurringSeriesForAnomaly[] = []
): DetectedAnomaly[] {
  const duplicates = detectDuplicateExpenses(transactions);
  const spikes = detectSpendingSpikes(transactions);
  const subscriptionIncreases = detectSubscriptionIncreases(transactions, recurringSeries);

  return [...duplicates, ...spikes, ...subscriptionIncreases];
}
