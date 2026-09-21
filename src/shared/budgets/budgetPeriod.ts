import type { Budget } from '@database/models';

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

/** Sequelize DATEONLY may come back as a string or Date. */
export function toDateOnly(value: Date | string | null | undefined, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.slice(0, 10);
  return utcYmd(value);
}

/**
 * Resolve the active tracking window for a budget.
 * - weekly: current calendar week (Sun–Sat) in UTC
 * - monthly: current calendar month in UTC
 * - custom: stored startDate–endDate (endDate required at create time)
 */
export function getBudgetDateRange(
  budget: Pick<Budget, 'type' | 'startDate' | 'endDate'>,
  now = new Date()
): {
  startDate: string;
  endDate: string;
} {
  if (budget.type === 'weekly') {
    const day = now.getUTCDay();
    const start = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
    const end = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 6);
    return { startDate: utcYmd(start), endDate: utcYmd(end) };
  }

  if (budget.type === 'custom') {
    const fallbackStart = utcYmd(now);
    const startDate = toDateOnly(budget.startDate, fallbackStart);
    const endDate = toDateOnly(budget.endDate, startDate);
    return { startDate, endDate };
  }

  // monthly (and any legacy unknown period)
  const start = utcDate(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
  return { startDate: utcYmd(start), endDate: utcYmd(end) };
}

/**
 * Resolve the immediately preceding tracking window for a budget — used for rollover.
 * Not meaningful for `custom` budgets (one-off range), so callers should skip rollover for those.
 */
export function getPreviousBudgetDateRange(
  budget: Pick<Budget, 'type' | 'startDate' | 'endDate'>,
  now = new Date()
): { startDate: string; endDate: string } {
  if (budget.type === 'weekly') {
    const day = now.getUTCDay();
    const currentStart = utcDate(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day);
    const prevStart = utcDate(
      currentStart.getUTCFullYear(),
      currentStart.getUTCMonth(),
      currentStart.getUTCDate() - 7
    );
    const prevEnd = utcDate(
      currentStart.getUTCFullYear(),
      currentStart.getUTCMonth(),
      currentStart.getUTCDate() - 1
    );
    return { startDate: utcYmd(prevStart), endDate: utcYmd(prevEnd) };
  }

  // monthly (and any legacy unknown period)
  const start = utcDate(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const end = utcDate(now.getUTCFullYear(), now.getUTCMonth(), 0);
  return { startDate: utcYmd(start), endDate: utcYmd(end) };
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
      periodStart = utcDate(cursorEnd.getUTCFullYear(), cursorEnd.getUTCMonth(), cursorEnd.getUTCDate() - day);
      periodEnd = utcDate(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate() + 6);
    } else {
      // monthly (and any legacy unknown period)
      periodStart = utcDate(cursorEnd.getUTCFullYear(), cursorEnd.getUTCMonth(), 1);
      periodEnd = utcDate(cursorEnd.getUTCFullYear(), cursorEnd.getUTCMonth() + 1, 0);
    }

    if (periodEnd < from) break;

    periods.push({
      startDate: utcYmd(periodStart),
      endDate: utcYmd(periodEnd),
    });

    // Step the cursor into the period immediately before this one.
    cursorEnd = utcDate(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate() - 1);
  }

  return periods;
}
