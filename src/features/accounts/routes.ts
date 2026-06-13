import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as accountService from './account.service';
import { createAccountSchema, updateAccountSchema } from './account.validation';
import { uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const accounts = await accountService.listAccounts((req as AuthRequest).userId!);
    successResponse(res, accounts);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createAccountSchema.parse(req.body);
    const account = await accountService.createAccount((req as AuthRequest).userId!, data);
    successResponse(res, account, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = updateAccountSchema.parse(req.body);
    const account = await accountService.updateAccount((req as AuthRequest).userId!, id, data);
    successResponse(res, account);
  })
);

export default router;
