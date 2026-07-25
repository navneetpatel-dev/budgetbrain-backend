import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/integrations.controller';
import {
  confirmParsedSchema,
  parseEmailSchema,
  parseSmsSchema,
} from '../validator/integrations.validation';

const router = Router();
router.use(authenticate);

router.post('/sms', validateBody(parseSmsSchema), asyncHandler(controller.parseSms));
router.post('/email', validateBody(parseEmailSchema), asyncHandler(controller.parseEmail));
router.get('/pending', validateQuery(paginationSchema), asyncHandler(controller.listPending));
router.post(
  '/:id/confirm',
  validateParams(uuidParamSchema),
  validateBody(confirmParsedSchema),
  asyncHandler(controller.confirmParsed)
);
router.post(
  '/:id/reject',
  validateParams(uuidParamSchema),
  asyncHandler(controller.rejectParsed)
);

export default router;
