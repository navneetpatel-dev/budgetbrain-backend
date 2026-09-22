import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import { uploadCsv } from '@core/middleware/upload';
import * as controller from './integrations.controller';
import {
  confirmParsedSchema,
  parseEmailSchema,
  parseSmsSchema,
} from '@shared/modules/integrations/integrations.validator';

const router = Router();
router.use(authenticate);

router.post('/sms', validateBody(parseSmsSchema), asyncHandler(controller.parseSms));
router.post('/email', validateBody(parseEmailSchema), asyncHandler(controller.parseEmail));
router.post('/csv', uploadCsv.single('file'), asyncHandler(controller.importCsv));
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
