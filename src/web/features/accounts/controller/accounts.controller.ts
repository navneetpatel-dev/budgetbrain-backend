import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as accountService from '../service/account.service';
import type { CreateAccountInput, UpdateAccountInput } from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listAccounts(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await accountService.listAccounts((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createAccount(req: Request, res: Response) {
  const account = await accountService.createAccount(
    (req as AuthRequest).userId!,
    req.body as CreateAccountInput
  );
  successResponse(res, account, 201);
}

export async function updateAccount(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const account = await accountService.updateAccount(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateAccountInput
  );
  successResponse(res, account);
}
