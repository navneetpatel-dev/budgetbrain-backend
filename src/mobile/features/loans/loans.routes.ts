import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './loans.controller';
import { createLoanSchema, payLoanSchema, updateLoanSchema } from '@shared/modules/loans/loans.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listLoans));
router.post('/', validateBody(createLoanSchema), asyncHandler(controller.createLoan));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getLoan));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateLoanSchema),
  asyncHandler(controller.updateLoan)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteLoan));
router.post(
  '/:id/pay',
  validateParams(uuidParamSchema),
  validateBody(payLoanSchema),
  asyncHandler(controller.payLoan)
);

export default router;
