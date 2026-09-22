import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './investments.controller';
import {
  createInvestmentSchema,
  updateInvestmentSchema,
} from '@shared/modules/investments/investments.validator';

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
