import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/investments.controller';
import {
  createInvestmentSchema,
  updateInvestmentSchema,
} from '../validator/investment.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listInvestments));
router.post('/', validateBody(createInvestmentSchema), asyncHandler(controller.createInvestment));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateInvestmentSchema),
  asyncHandler(controller.updateInvestment)
);

export default router;
