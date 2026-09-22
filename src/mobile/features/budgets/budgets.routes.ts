import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './budgets.controller';
import { createBudgetSchema, updateBudgetSchema } from '@shared/modules/budgets/budgets.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listBudgets));
router.post('/', validateBody(createBudgetSchema), asyncHandler(controller.createBudget));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getBudget));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateBudgetSchema),
  asyncHandler(controller.updateBudget)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteBudget));

export default router;
