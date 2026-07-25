import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as incomeService from '../service/income.service';
import type {
  CreateIncomeInput,
  CreateSourceInput,
  ListIncomeInput,
  UpdateIncomeInput,
} from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listIncome(req: Request, res: Response) {
  const filters = req.query as ListIncomeInput;
  const data = await incomeService.listIncome((req as AuthRequest).userId!, filters);
  successResponse(res, data);
}

export async function createIncome(req: Request, res: Response) {
  const income = await incomeService.createIncome(
    (req as AuthRequest).userId!,
    req.body as CreateIncomeInput
  );
  successResponse(res, income, 201);
}

export async function listSources(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await incomeService.listSources((req as AuthRequest).userId!, { page, limit });
  successResponse(res, data);
}

export async function createSource(req: Request, res: Response) {
  const source = await incomeService.createSource(
    (req as AuthRequest).userId!,
    req.body as CreateSourceInput
  );
  successResponse(res, source, 201);
}

export async function getIncome(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const income = await incomeService.getIncome((req as AuthRequest).userId!, id);
  successResponse(res, income);
}

export async function updateIncome(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const income = await incomeService.updateIncome(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateIncomeInput
  );
  successResponse(res, income);
}

export async function deleteIncome(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await incomeService.deleteIncome((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Income deleted' });
}
