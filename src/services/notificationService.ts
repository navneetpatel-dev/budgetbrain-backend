import { Notification, NotificationType } from '../models';
import { sendPushToUser } from './pushService';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sendPush = true
) {
  const notification = await Notification.create({
    userId,
    type,
    title,
    body,
    data: data ?? null,
    sentAt: new Date(),
  });

  if (sendPush) {
    await sendPushToUser(userId, title, body, data);
  }

  return notification;
}
