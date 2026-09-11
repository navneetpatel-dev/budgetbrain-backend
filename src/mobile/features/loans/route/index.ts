import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/loans.controller';
import { createLoanSchema, payLoanSchema, updateLoanSchema } from '../validator/loan.validation';

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
