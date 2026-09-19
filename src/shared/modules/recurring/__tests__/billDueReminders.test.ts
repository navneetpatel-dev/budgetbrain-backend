import { describe, it, expect, beforeAll } from 'vitest';
import { RecurringSeries, Notification, Category } from '@database/models';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import { sendBillDueReminders } from '../service/recurringSeries.service';

function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('sendBillDueReminders', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('includes merchant/categoryId/amount/currency in the bill_due notification data, not just the series id', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id, { name: 'Utilities' });
    const series = await RecurringSeries.create({
      userId: user.id,
      merchant: 'City Power Co',
      categoryId: category.id,
      amount: 1499,
      currency: 'INR',
      cadence: 'monthly',
      reminderDaysBefore: 3,
      nextDueDate: new Date(isoDaysFromToday(1)),
      active: true,
    } as never);

    await sendBillDueReminders();

    const notification = await Notification.findOne({
      where: { userId: user.id, type: 'bill_due' },
      order: [['createdAt', 'DESC']],
    });

    expect(notification).not.toBeNull();
    const data = notification!.data as Record<string, unknown>;
    expect(data.recurringSeriesId).toBe(series.id);
    expect(data.merchant).toBe('City Power Co');
    expect(data.categoryId).toBe(category.id);
    expect(Number(data.amount)).toBe(1499);
    expect(data.currency).toBe('INR');
  });

  it('carries a null categoryId (not a crash) when the series has no category', async () => {
    const user = await createTestUser();
    await RecurringSeries.create({
      userId: user.id,
      merchant: 'Uncategorized Bill',
      categoryId: null,
      amount: 250,
      currency: 'INR',
      cadence: 'monthly',
      reminderDaysBefore: 2,
      nextDueDate: new Date(isoDaysFromToday(0)),
      active: true,
    } as never);

    await sendBillDueReminders();

    const notification = await Notification.findOne({
      where: { userId: user.id, type: 'bill_due' },
      order: [['createdAt', 'DESC']],
    });

    expect(notification).not.toBeNull();
    const data = notification!.data as Record<string, unknown>;
    expect(data.categoryId).toBeNull();
    expect(data.merchant).toBe('Uncategorized Bill');
  });
});
