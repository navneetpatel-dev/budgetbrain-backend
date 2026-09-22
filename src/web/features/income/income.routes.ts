import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './income.controller';
import {
  createIncomeSchema,
  createSourceSchema,
  listIncomeSchema,
  updateIncomeSchema,
  allocateIncomeSchema,
} from '@shared/modules/income/income.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(listIncomeSchema), asyncHandler(controller.listIncome));
router.post('/', validateBody(createIncomeSchema), asyncHandler(controller.createIncome));
router.get('/sources', validateQuery(paginationSchema), asyncHandler(controller.listSources));
router.post('/sources', validateBody(createSourceSchema), asyncHandler(controller.createSource));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getIncome));
router.post(
  '/:id/duplicate',
  validateParams(uuidParamSchema),
  asyncHandler(controller.duplicateIncome)
);
router.post(
  '/:id/allocate',
  validateParams(uuidParamSchema),
  validateBody(allocateIncomeSchema),
  asyncHandler(controller.allocateIncome)
);
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateIncomeSchema),
  asyncHandler(controller.updateIncome)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteIncome));

export default router;
