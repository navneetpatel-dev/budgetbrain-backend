import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { Notification, Device } from '../models';
import { sendPushToUser } from '../services/pushService';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const notifications = await Notification.findAll({
      where: { userId: (req as AuthRequest).userId! },
      order: [['sentAt', 'DESC']],
      limit: 50,
    });
    successResponse(res, notifications);
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const notification = await Notification.findOne({
      where: { id: String(req.params.id), userId: (req as AuthRequest).userId! },
    });
    if (!notification) throw new AppError(404, 'Notification not found');

    await notification.update({ read: true });
    successResponse(res, notification);
  })
);

router.post(
  '/register-device',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        pushToken: z.string(),
        deviceName: z.string().default('Unknown Device'),
        platform: z.enum(['ios', 'android', 'web']).default('android'),
      })
      .parse(req.body);

    const userId = (req as AuthRequest).userId!;

    let device = await Device.findOne({ where: { userId, pushToken: data.pushToken } });
    if (device) {
      await device.update({ lastActiveAt: new Date(), deviceName: data.deviceName, platform: data.platform });
    } else {
      device = await Device.create({
        userId,
        pushToken: data.pushToken,
        deviceName: data.deviceName,
        platform: data.platform,
      });
    }

    successResponse(res, { registered: true, deviceId: device.id });
  })
);

router.post(
  '/test',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const sent = await sendPushToUser(userId, 'ExpenseFlow', 'Push notifications are working!');
    successResponse(res, { sent });
  })
);

export default router;
