import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './recurring.controller';
import {
  createRecurringSeriesSchema,
  updateRecurringSeriesSchema,
} from '@shared/modules/recurring/recurring.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listRecurringSeries));
router.post('/', validateBody(createRecurringSeriesSchema), asyncHandler(controller.createRecurringSeries));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateRecurringSeriesSchema),
  asyncHandler(controller.updateRecurringSeries)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteRecurringSeries));
router.post('/detect', asyncHandler(controller.detectRecurring));

export default router;
