import type { Budget } from '@database/models';

/** Sequelize DATEONLY may come back as a string or Date. */
export function toDateOnly(value: Date | string | null | undefined, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/**
 * Resolve the active tracking window for a budget.
 * - weekly: current calendar week (Sun–Sat)
 * - monthly: current calendar month
 * - custom: stored startDate–endDate (endDate required at create time)
 */
export function getBudgetDateRange(budget: Pick<Budget, 'type' | 'startDate' | 'endDate'>): {
  startDate: string;
  endDate: string;
} {
  const now = new Date();

  if (budget.type === 'weekly') {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  if (budget.type === 'custom') {
    const fallbackStart = now.toISOString().slice(0, 10);
    const startDate = toDateOnly(budget.startDate, fallbackStart);
    const endDate = toDateOnly(budget.endDate, startDate);
    return { startDate, endDate };
  }

  // monthly (and any legacy unknown period)
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Resolve the immediately preceding tracking window for a budget — used for rollover.
 * Not meaningful for `custom` budgets (one-off range), so callers should skip rollover for those.
 */
export function getPreviousBudgetDateRange(
  budget: Pick<Budget, 'type' | 'startDate' | 'endDate'>
): { startDate: string; endDate: string } {
  const now = new Date();

  if (budget.type === 'weekly') {
    const day = now.getDay();
    const currentStart = new Date(now);
    currentStart.setDate(now.getDate() - day);
    const prevStart = new Date(currentStart);
    prevStart.setDate(currentStart.getDate() - 7);
    const prevEnd = new Date(currentStart);
    prevEnd.setDate(currentStart.getDate() - 1);
    return {
      startDate: prevStart.toISOString().slice(0, 10),
      endDate: prevEnd.toISOString().slice(0, 10),
    };
  }

  // monthly (and any legacy unknown period)
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

/**
 * Enumerate a budget's period boundaries strictly between `fromDate` (exclusive) and
 * `toDate` (exclusive), walking backward from `toDate`. Used by compounding rollover to
 * accumulate leftover/deficit across every prior period since rollover was enabled.
 * Not meaningful for `custom` budgets (one-off range) — callers should skip those.
 * Returns at most `maxPeriods` entries, most-recent-first, to bound query cost.
 */
export function getPeriodsBetween(
  budget: Pick<Budget, 'type'>,
  fromDate: string,
  toDate: string,
  maxPeriods = 24
): { startDate: string; endDate: string }[] {
  const periods: { startDate: string; endDate: string }[] = [];
  const from = new Date(fromDate + 'T00:00:00Z');

  // Anchor the walk on `toDate` so periods align with the budget's actual calendar
  // boundaries (week starting Sunday / calendar month), not an arbitrary offset from `from`.
  let cursorEnd = new Date(toDate + 'T00:00:00Z');

  while (periods.length < maxPeriods) {
    let periodStart: Date;
    let periodEnd: Date;

    if (budget.type === 'weekly') {
      const day = cursorEnd.getUTCDay();
      periodStart = new Date(cursorEnd);
      periodStart.setUTCDate(cursorEnd.getUTCDate() - day);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodStart.getUTCDate() + 6);
    } else {
      // monthly (and any legacy unknown period)
      periodStart = new Date(Date.UTC(cursorEnd.getUTCFullYear(), cursorEnd.getUTCMonth(), 1));
      periodEnd = new Date(Date.UTC(cursorEnd.getUTCFullYear(), cursorEnd.getUTCMonth() + 1, 0));
    }

    if (periodEnd < from) break;

    periods.push({
      startDate: periodStart.toISOString().slice(0, 10),
      endDate: periodEnd.toISOString().slice(0, 10),
    });

    // Step the cursor into the period immediately before this one.
    cursorEnd = new Date(periodStart);
    cursorEnd.setUTCDate(periodStart.getUTCDate() - 1);
  }

  return periods;
}
