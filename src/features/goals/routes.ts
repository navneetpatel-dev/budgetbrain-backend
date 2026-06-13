import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as goalService from './goal.service';
import {
  createGoalSchema,
  updateGoalSchema,
  contributeGoalSchema,
} from './goal.validation';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await goalService.listGoals((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createGoalSchema.parse(req.body);
    const goal = await goalService.createGoal((req as AuthRequest).userId!, data);
    successResponse(res, goal, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const goal = await goalService.getGoal((req as AuthRequest).userId!, id);
    successResponse(res, goal);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = updateGoalSchema.parse(req.body);
    const goal = await goalService.updateGoal((req as AuthRequest).userId!, id, data);
    successResponse(res, goal);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    await goalService.deleteGoal((req as AuthRequest).userId!, id);
    successResponse(res, { message: 'Goal deleted' });
  })
);

router.post(
  '/:id/contribute',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const { amount, notes } = contributeGoalSchema.parse(req.body);
    const result = await goalService.contributeToGoal(
      (req as AuthRequest).userId!,
      id,
      amount,
      notes
    );
    successResponse(res, result, 201);
  })
);

export default router;
