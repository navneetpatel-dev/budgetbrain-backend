import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/income.controller';
import {
  createIncomeSchema,
  createSourceSchema,
  listIncomeSchema,
  updateIncomeSchema,
} from '../validator/income.validation';

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
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateIncomeSchema),
  asyncHandler(controller.updateIncome)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteIncome));

export default router;
