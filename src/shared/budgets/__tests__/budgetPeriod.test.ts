import { describe, it, expect } from 'vitest';
import { getBudgetDateRange, getPreviousBudgetDateRange } from '../budgetPeriod';

describe('budget period UTC anchoring', () => {
  it('uses the UTC calendar month even when local midnight would shift backward (IST)', () => {
    // 1 Oct 2026 00:30 IST = 30 Sep 2026 19:00 UTC
    const now = new Date('2026-09-30T19:00:00.000Z');
    const range = getBudgetDateRange({ type: 'monthly', startDate: new Date(), endDate: null }, now);
    expect(range.startDate).toBe('2026-09-01');
    expect(range.endDate).toBe('2026-09-30');
  });

  it('uses the UTC calendar month after UTC midnight on the 1st', () => {
    const now = new Date('2026-10-01T00:30:00.000Z');
    const range = getBudgetDateRange({ type: 'monthly', startDate: new Date(), endDate: null }, now);
    expect(range.startDate).toBe('2026-10-01');
    expect(range.endDate).toBe('2026-10-31');
  });

  it('previous monthly window is the prior UTC month', () => {
    const now = new Date('2026-10-15T08:00:00.000Z');
    const range = getPreviousBudgetDateRange({ type: 'monthly', startDate: new Date(), endDate: null }, now);
    expect(range.startDate).toBe('2026-09-01');
    expect(range.endDate).toBe('2026-09-30');
  });

  it('weekly windows start on Sunday UTC', () => {
    // Wednesday 2026-10-07
    const now = new Date('2026-10-07T12:00:00.000Z');
    const range = getBudgetDateRange({ type: 'weekly', startDate: new Date(), endDate: null }, now);
    expect(range.startDate).toBe('2026-10-04');
    expect(range.endDate).toBe('2026-10-10');
  });
});
