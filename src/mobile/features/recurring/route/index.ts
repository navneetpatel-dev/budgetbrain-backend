import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/recurringSeries.controller';
import {
  createRecurringSeriesSchema,
  updateRecurringSeriesSchema,
} from '@shared/modules/recurring/validator/recurringSeries.validation';

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
