import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/notifications.controller';
import { registerDeviceSchema } from '../validator/notification.validation';

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
