import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as budgetService from './budget.service';
import { createBudgetSchema, updateBudgetSchema } from './budget.validation';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await budgetService.listBudgets((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createBudgetSchema.parse(req.body);
    const budget = await budgetService.createBudget((req as AuthRequest).userId!, data);
    successResponse(res, budget, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const budget = await budgetService.getBudget((req as AuthRequest).userId!, id);
    successResponse(res, budget);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = updateBudgetSchema.parse(req.body);
    const budget = await budgetService.updateBudget((req as AuthRequest).userId!, id, data);
    successResponse(res, budget);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    await budgetService.deleteBudget((req as AuthRequest).userId!, id);
    successResponse(res, { message: 'Budget deleted' });
  })
);

export default router;
