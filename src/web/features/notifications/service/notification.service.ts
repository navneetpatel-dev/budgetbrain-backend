import type { Transaction as DbTransaction } from 'sequelize';
import { Notification, NotificationType, Device } from '../../../../models';
import { AppError } from '../../../shared/utils/errors';
import { sendPushToUser } from './push.service';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type { RegisterDeviceInput } from '../types';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  sendPush = true,
  dbTx?: DbTransaction
) {
  const notification = await Notification.create(
    {
      userId,
      type,
      title,
      body,
      data: data ?? null,
      sentAt: new Date(),
    },
    dbTx ? { transaction: dbTx } : undefined
  );

  // Never send push inside an open DB transaction (external side-effect).
  if (sendPush && !dbTx) {
    await sendPushToUser(userId, title, body, data);
  }

  return notification;
}

export async function listNotifications(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 50);
  const { rows, count } = await Notification.findAndCountAll({
    where: { userId },
    order: [['sentAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('notifications', rows, count, page, limit);
}

export async function markAsRead(userId: string, id: string) {
  const notification = await Notification.findOne({ where: { id, userId } });
  if (!notification) throw new AppError(404, 'Notification not found');
  await notification.update({ read: true });
  return notification;
}

export async function registerDevice(userId: string, data: RegisterDeviceInput) {
  let device = await Device.findOne({ where: { userId, pushToken: data.pushToken } });
  if (device) {
    await device.update({
      lastActiveAt: new Date(),
      deviceName: data.deviceName,
      platform: data.platform,
    });
  } else {
    device = await Device.create({
      userId,
      pushToken: data.pushToken,
      deviceName: data.deviceName,
      platform: data.platform,
    });
  }

  return device;
}
