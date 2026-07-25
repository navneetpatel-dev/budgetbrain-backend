import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/expenses.controller';
import {
  listTransactionsSchema,
  searchQuerySchema,
  transactionSchema,
  updateTransactionSchema,
} from '../validator/transaction.validation';

const router = Router();
router.use(authenticate);

router.get('/dashboard', asyncHandler(controller.getDashboard));
router.get('/', validateQuery(listTransactionsSchema), asyncHandler(controller.listTransactions));
router.post('/', validateBody(transactionSchema), asyncHandler(controller.createTransaction));
router.get('/search', validateQuery(searchQuerySchema), asyncHandler(controller.searchTransactions));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getTransaction));
router.post(
  '/:id/duplicate',
  validateParams(uuidParamSchema),
  asyncHandler(controller.duplicateTransaction)
);
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateTransactionSchema),
  asyncHandler(controller.updateTransaction)
);
router.delete('/:id', validateParams(uuidParamSchema), asyncHandler(controller.deleteTransaction));

export default router;
