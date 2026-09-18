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
