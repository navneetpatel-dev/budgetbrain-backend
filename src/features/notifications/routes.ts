import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as notificationService from './notification.service';
import { registerDeviceSchema } from './notification.validation';
import { sendPushToUser } from './push.service';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await notificationService.listNotifications((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const notification = await notificationService.markAsRead((req as AuthRequest).userId!, id);
    successResponse(res, notification);
  })
);

router.post(
  '/register-device',
  asyncHandler(async (req, res) => {
    const data = registerDeviceSchema.parse(req.body);
    const device = await notificationService.registerDevice((req as AuthRequest).userId!, data);
    successResponse(res, { registered: true, deviceId: device.id });
  })
);

router.post(
  '/test',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const sent = await sendPushToUser(userId, 'BudgetBrain', 'Push notifications are working!');
    successResponse(res, { sent });
  })
);

export default router;
