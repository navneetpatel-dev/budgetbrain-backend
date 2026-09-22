import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './accounts.controller';
import { createAccountSchema, updateAccountSchema } from '@shared/modules/accounts/validator/account.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listAccounts));
router.post('/', validateBody(createAccountSchema), asyncHandler(controller.createAccount));
router.patch(
  '/:id',
  validateParams(uuidParamSchema),
  validateBody(updateAccountSchema),
  asyncHandler(controller.updateAccount)
);

export default router;
