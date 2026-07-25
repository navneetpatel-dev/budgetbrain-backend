import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as investmentService from '../service/investment.service';
import type {
  CreateInvestmentInput,
  UpdateInvestmentInput,
} from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listInvestments(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await investmentService.listInvestments((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function createInvestment(req: Request, res: Response) {
  const investment = await investmentService.createInvestment(
    (req as AuthRequest).userId!,
    req.body as CreateInvestmentInput
  );
  successResponse(res, investment, 201);
}

export async function updateInvestment(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const investment = await investmentService.updateInvestment(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateInvestmentInput
  );
  successResponse(res, investment);
}
