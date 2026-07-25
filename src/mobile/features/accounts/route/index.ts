import { Router } from 'express';
import { asyncHandler } from '../../../shared/utils/errors';
import { authenticate } from '../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../shared/validation';
import * as controller from '../controller/accounts.controller';
import { createAccountSchema, updateAccountSchema } from '../validator/account.validation';

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
