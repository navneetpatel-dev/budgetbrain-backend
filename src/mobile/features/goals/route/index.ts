import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/goals.controller';
import {
  contributeGoalSchema,
  createGoalSchema,
  updateGoalSchema,
} from '../validator/goal.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listGoals));
router.post('/', validateBody(createGoalSchema), asyncHandler(controller.createGoal));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getGoal));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateGoalSchema),
  asyncHandler(controller.updateGoal)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteGoal));
router.post(
  '/:id/contribute',
  validateParams(uuidParamSchema),
  validateBody(contributeGoalSchema),
  asyncHandler(controller.contributeToGoal)
);

export default router;
