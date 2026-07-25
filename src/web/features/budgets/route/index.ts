import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/budgets.controller';
import { createBudgetSchema, updateBudgetSchema } from '../validator/budget.validation';

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
