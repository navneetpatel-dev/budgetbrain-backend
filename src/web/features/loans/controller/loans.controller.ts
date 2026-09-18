import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '@shared/types';
import * as loanService from '@shared/modules/loans/service/loan.service';
import type { CreateLoanInput, PayLoanInput, UpdateLoanInput } from '@shared/modules/loans/types';
import type { PaginationInput } from '@shared/types';

export async function listLoans(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await loanService.listLoans((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createLoan(req: Request, res: Response) {
  const loan = await loanService.createLoan((req as AuthRequest).userId!, req.body as CreateLoanInput);
  successResponse(res, loan, 201);
}

export async function getLoan(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const loan = await loanService.getLoan((req as AuthRequest).userId!, id);
  successResponse(res, loan);
}

export async function updateLoan(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const loan = await loanService.updateLoan(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateLoanInput
  );
  successResponse(res, loan);
}

export async function deleteLoan(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await loanService.deleteLoan((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Loan deleted' });
}

export async function payLoan(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const { amount, notes } = req.body as PayLoanInput;
  const result = await loanService.payLoan((req as AuthRequest).userId!, id, amount, notes);
  successResponse(res, result, 201);
}
