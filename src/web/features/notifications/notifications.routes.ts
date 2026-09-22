import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './notifications.controller';
import { registerDeviceSchema } from '@shared/modules/notifications/notifications.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listNotifications));
router.post(
  '/register-device',
  validateBody(registerDeviceSchema),
  asyncHandler(controller.registerDevice)
);
router.post('/test', asyncHandler(controller.sendTestPush));
router.patch('/:id/read', validateParams(uuidParamSchema), asyncHandler(controller.markAsRead));

export default router;
