import { describe, it, expect } from 'vitest';
import {
  runAnomalyDetection,
  detectDuplicateExpenses,
  detectSpendingSpikes,
  detectSubscriptionIncreases,
  detectUnusualTransactions,
} from '../anomalyDetection.engine';

describe('Anomaly Detection Engine', () => {
  const now = new Date();

  describe('detectDuplicateExpenses', () => {
    it('detects duplicate charges at same merchant with same amount within 48h', () => {
      const txs = [
        {
          id: 'tx-1',
          amount: 450,
          merchant: 'Swiggy',
          categoryId: 'food',
          date: new Date(now.getTime() - 2 * 3600000),
        },
        {
          id: 'tx-2',
          amount: 450,
          merchant: 'Swiggy',
          categoryId: 'food',
          date: new Date(now.getTime() - 1 * 3600000),
        },
      ];

      const anomalies = detectDuplicateExpenses(txs);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('duplicate_expense');
      expect(anomalies[0].transactionId).toBe('tx-2');
      expect(anomalies[0].merchant).toBe('Swiggy');
    });

    it('ignores transactions with different amounts or outside time window', () => {
      const txs = [
        {
          id: 'tx-1',
          amount: 450,
          merchant: 'Swiggy',
          categoryId: 'food',
          date: new Date(now.getTime() - 72 * 3600000), // 3 days ago
        },
        {
          id: 'tx-2',
          amount: 450,
          merchant: 'Swiggy',
          categoryId: 'food',
          date: now,
        },
        {
          id: 'tx-3',
          amount: 300,
          merchant: 'Swiggy',
          categoryId: 'food',
          date: now,
        },
      ];

      const anomalies = detectDuplicateExpenses(txs);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('detectSpendingSpikes', () => {
    it('detects spending spike significantly above category baseline', () => {
      const txs = [
        { id: '1', amount: 150, merchant: 'Cafe A', categoryId: 'cat-1', categoryName: 'Dining', date: now },
        { id: '2', amount: 180, merchant: 'Cafe B', categoryId: 'cat-1', categoryName: 'Dining', date: now },
        { id: '3', amount: 160, merchant: 'Cafe C', categoryId: 'cat-1', categoryName: 'Dining', date: now },
        { id: '4', amount: 170, merchant: 'Cafe D', categoryId: 'cat-1', categoryName: 'Dining', date: now },
        // Outlier spike: 2500 vs avg ~165
        { id: '5', amount: 2500, merchant: 'Luxury Dining', categoryId: 'cat-1', categoryName: 'Dining', date: now },
      ];

      const anomalies = detectSpendingSpikes(txs);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('spending_spike');
      expect(anomalies[0].transactionId).toBe('5');
    });

    it('requires at least 3 transactions to establish baseline', () => {
      const txs = [
        { id: '1', amount: 150, merchant: 'Cafe A', categoryId: 'cat-1', date: now },
        { id: '2', amount: 5000, merchant: 'Store B', categoryId: 'cat-1', date: now },
      ];

      const anomalies = detectSpendingSpikes(txs);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('detectSubscriptionIncreases', () => {
    it('flags transaction higher than recurring nominal amount by > 5%', () => {
      const txs = [
        { id: '1', amount: 799, merchant: 'Netflix', categoryId: 'sub', date: now },
      ];
      const series = [
        { id: 's1', merchant: 'Netflix', amount: 649, cadence: 'monthly' },
      ];

      const anomalies = detectSubscriptionIncreases(txs, series);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('subscription_cost_increase');
      expect(anomalies[0].merchant).toBe('Netflix');
      expect(anomalies[0].amount).toBe(799);
    });

    it('does not flag normal or decreased charges', () => {
      const txs = [
        { id: '1', amount: 649, merchant: 'Netflix', categoryId: 'sub', date: now },
        { id: '2', amount: 199, merchant: 'Spotify', categoryId: 'sub', date: now },
      ];
      const series = [
        { id: 's1', merchant: 'Netflix', amount: 649, cadence: 'monthly' },
        { id: 's2', merchant: 'Spotify', amount: 299, cadence: 'monthly' },
      ];

      const anomalies = detectSubscriptionIncreases(txs, series);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('detectUnusualTransactions', () => {
    it('detects transaction significantly higher than merchant baseline', () => {
      const txs = [
        { id: '1', amount: 200, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
        { id: '2', amount: 220, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
        { id: '3', amount: 210, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
        // Baseline ~210, outlier: 1500 (> 2.5x and > 500 diff)
        { id: '4', amount: 1500, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
      ];

      const anomalies = detectUnusualTransactions(txs);
      expect(anomalies).toHaveLength(1);
      expect(anomalies[0].type).toBe('unusual_transaction');
      expect(anomalies[0].transactionId).toBe('4');
      expect(anomalies[0].merchant).toBe('Grocery Hub');
    });

    it('ignores normal fluctuations or merchants with fewer than 3 transactions', () => {
      const txs = [
        { id: '1', amount: 200, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
        { id: '2', amount: 1500, merchant: 'Grocery Hub', categoryId: 'groceries', date: now },
      ];

      const anomalies = detectUnusualTransactions(txs);
      expect(anomalies).toHaveLength(0);
    });
  });

  describe('runAnomalyDetection', () => {
    it('runs all anomaly checks concurrently', () => {
      const txs = [
        { id: '1', amount: 100, merchant: 'Shop', categoryId: 'cat', date: new Date(now.getTime() - 3600000) },
        { id: '2', amount: 100, merchant: 'Shop', categoryId: 'cat', date: now },
      ];
      const all = runAnomalyDetection(txs, []);
      expect(all.length).toBeGreaterThan(0);
    });
  });
});

