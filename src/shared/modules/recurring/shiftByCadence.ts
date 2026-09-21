import type { RecurringCadence } from '@database/models';

export function shiftDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function toIsoDate(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Clamp day-of-month so Jan 31 → Feb 28 and leap Feb 29 → Feb 28 next year. */
export function shiftByCadence(iso: string, cadence: RecurringCadence): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (cadence === 'weekly') return shiftDaysIso(iso, 7);
  let year = y;
  let monthIndex = m - 1;
  if (cadence === 'yearly') {
    year += 1;
  } else {
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
  }
  const daysInTargetMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(d, daysInTargetMonth))).toISOString().slice(0, 10);
}

export function shiftByCadenceDate(date: Date | string, cadence: RecurringCadence): Date {
  return new Date(`${shiftByCadence(toIsoDate(date), cadence)}T12:00:00.000Z`);
}
