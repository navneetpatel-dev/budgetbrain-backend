import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import {
  createNotification,
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from '../service/notification.service';
import { AppError } from '@shared/errors';

describe('notification.service', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('creates notifications and counts unread accurately', async () => {
    const user = await createTestUser();

    await createNotification(user.id, 'general', 'Alert 1', 'First notification', undefined, false);
    await createNotification(user.id, 'general', 'Alert 2', 'Second notification', undefined, false);

    const count = await getUnreadCount(user.id);
    expect(count.unreadCount).toBe(2);

    const list = await listNotifications(user.id);
    expect(list.notifications).toHaveLength(2);
  });

  it('marks a single notification as read', async () => {
    const user = await createTestUser();
    const notif = await createNotification(user.id, 'general', 'Single', 'Mark me read', undefined, false);

    const updated = await markAsRead(user.id, notif.id);
    expect(updated.read).toBe(true);

    const count = await getUnreadCount(user.id);
    expect(count.unreadCount).toBe(0);
  });

  it('marks all notifications as read in bulk', async () => {
    const user = await createTestUser();
    await createNotification(user.id, 'general', 'Bulk 1', 'Content 1', undefined, false);
    await createNotification(user.id, 'general', 'Bulk 2', 'Content 2', undefined, false);

    const { updatedCount } = await markAllAsRead(user.id);
    expect(updatedCount).toBe(2);

    const count = await getUnreadCount(user.id);
    expect(count.unreadCount).toBe(0);
  });

  it('deletes a notification', async () => {
    const user = await createTestUser();
    const notif = await createNotification(user.id, 'general', 'Delete me', 'Content', undefined, false);

    await deleteNotification(user.id, notif.id);

    const list = await listNotifications(user.id);
    expect(list.notifications).toHaveLength(0);
  });

  it('throws 404 when deleting or marking non-existent notification', async () => {
    const user = await createTestUser();
    await expect(deleteNotification(user.id, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      AppError
    );
  });
});
