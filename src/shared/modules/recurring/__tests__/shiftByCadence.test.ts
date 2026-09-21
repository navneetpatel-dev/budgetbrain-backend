import { describe, it, expect } from 'vitest';
import { shiftByCadence } from '../shiftByCadence';

describe('shiftByCadence month-end clamping', () => {
  it('shifts Jan 31 monthly to Feb 28 in a non-leap year', () => {
    expect(shiftByCadence('2026-01-31', 'monthly')).toBe('2026-02-28');
  });

  it('shifts Jan 31 monthly to Feb 29 in a leap year', () => {
    expect(shiftByCadence('2024-01-31', 'monthly')).toBe('2024-02-29');
  });

  it('shifts Feb 29 yearly to Feb 28 in the following non-leap year', () => {
    expect(shiftByCadence('2024-02-29', 'yearly')).toBe('2025-02-28');
  });

  it('leaves a mid-month date on the same day next month', () => {
    expect(shiftByCadence('2026-01-15', 'monthly')).toBe('2026-02-15');
  });

  it('shifts weekly by 7 days', () => {
    expect(shiftByCadence('2026-01-31', 'weekly')).toBe('2026-02-07');
  });
});
