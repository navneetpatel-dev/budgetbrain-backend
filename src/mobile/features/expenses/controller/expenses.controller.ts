import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import * as transactionService from '../service/transaction.service';
import * as dashboardService from '../../dashboard/service/dashboard.service';
import type {
  CreateTransactionInput,
  ListTransactionsInput,
  SearchQueryInput,
  UpdateTransactionInput,
} from '../types';

export async function getDashboard(req: Request, res: Response) {
  const data = await dashboardService.getDashboard((req as AuthRequest).userId!);
  successResponse(res, data);
}

export async function listTransactions(req: Request, res: Response) {
  const filters = req.query as unknown as ListTransactionsInput;
  const data = await transactionService.listTransactions((req as AuthRequest).userId!, filters);
  successResponse(res, data);
}

export async function createTransaction(req: Request, res: Response) {
  const transaction = await transactionService.createTransaction(
    (req as AuthRequest).userId!,
    req.body as CreateTransactionInput
  );
  successResponse(res, transaction, 201);
}

export async function searchTransactions(req: Request, res: Response) {
  const { q, page, limit } = req.query as unknown as SearchQueryInput;
  const data = await transactionService.globalSearch((req as AuthRequest).userId!, q, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function getTransaction(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const transaction = await transactionService.getTransaction((req as AuthRequest).userId!, id);
  successResponse(res, transaction);
}

export async function duplicateTransaction(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const transaction = await transactionService.duplicateTransaction(
    (req as AuthRequest).userId!,
    id
  );
  successResponse(res, transaction, 201);
}

export async function updateTransaction(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const transaction = await transactionService.updateTransaction(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateTransactionInput
  );
  successResponse(res, transaction);
}

export async function deleteTransaction(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await transactionService.deleteTransaction((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Transaction deleted' });
}
