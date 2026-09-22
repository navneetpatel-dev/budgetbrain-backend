import { describe, it, expect, beforeAll } from 'vitest';
import { RecurringSeries } from '@database/models';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { listRecurringSeries } from '../service/recurringSeries.service';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

describe('detectRecurringSeries (via listRecurringSeries)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('creates a detected series from the most recent isRecurring-flagged expense per merchant', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      merchant: 'Netflix',
      amount: 649,
      isRecurring: true,
      date: daysAgo(40),
    });
    // A newer occurrence for the same merchant — the series should use this amount/date, not the older one.
    await createTestTransaction(user.id, {
      merchant: 'Netflix',
      amount: 699,
      isRecurring: true,
      date: daysAgo(10),
    });

    const { recurringSeries } = await listRecurringSeries(user.id);

    const netflix = recurringSeries.find((s) => s.merchant === 'Netflix');
    expect(netflix).toBeDefined();
    expect(Number(netflix!.amount)).toBe(699);
    expect(netflix!.source).toBe('detected');
  });

  it('ignores an isRecurring expense older than the 180-day lookback window', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      merchant: 'Ancient Gym Membership',
      amount: 1200,
      isRecurring: true,
      date: daysAgo(200),
    });

    const { recurringSeries } = await listRecurringSeries(user.id);

    expect(recurringSeries.find((s) => s.merchant === 'Ancient Gym Membership')).toBeUndefined();
  });

  it('does not clobber a series the user has already edited', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      merchant: 'Spotify',
      amount: 119,
      isRecurring: true,
      date: daysAgo(5),
    });
    // First call creates the detected series.
    await listRecurringSeries(user.id);

    const created = await RecurringSeries.findOne({ where: { userId: user.id, merchant: 'Spotify' } });
    expect(created).not.toBeNull();
    await created!.update({ amount: 199 }); // user manually corrected the amount

    // A second detection pass (e.g. another expense list load) must not overwrite the edit.
    await listRecurringSeries(user.id);

    const stillEdited = await RecurringSeries.findOne({ where: { userId: user.id, merchant: 'Spotify' } });
    expect(Number(stillEdited!.amount)).toBe(199);

    // And exactly one row exists — no duplicate created by the second pass.
    const count = await RecurringSeries.count({ where: { userId: user.id, merchant: 'Spotify' } });
    expect(count).toBe(1);
  });

  it('is idempotent across repeated calls for the same new merchant', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      merchant: 'Amazon Prime',
      amount: 1499,
      isRecurring: true,
      date: daysAgo(2),
    });

    await Promise.all([listRecurringSeries(user.id), listRecurringSeries(user.id), listRecurringSeries(user.id)]);

    const count = await RecurringSeries.count({ where: { userId: user.id, merchant: 'Amazon Prime' } });
    expect(count).toBe(1);
  });
});
