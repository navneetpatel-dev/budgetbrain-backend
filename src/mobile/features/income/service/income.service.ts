import * as transactionService from '../../expenses/service/transaction.service';
import { IncomeSource } from '../../../../shared/models';
import { AppError } from '../../../../shared/utils/errors';
import { paginatedResult, resolvePagination } from '../../../../shared/pagination';
import type { PaginationInput } from '../../../../shared/types';
import type {
  CreateIncomeInput,
  CreateSourceInput,
  ListIncomeInput,
  UpdateIncomeInput,
} from '../types';

export async function getIncome(userId: string, id: string) {
  const transaction = await transactionService.getTransaction(userId, id);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transaction;
}

export async function listIncome(userId: string, filters: ListIncomeInput) {
  return transactionService.listTransactions(userId, { ...filters, type: 'income' });
}

export async function createIncome(userId: string, data: CreateIncomeInput) {
  return transactionService.createTransaction(userId, { ...data, type: 'income' });
}

export async function updateIncome(userId: string, id: string, data: UpdateIncomeInput) {
  const transaction = await transactionService.updateTransaction(userId, id, data);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transaction;
}

export async function deleteIncome(userId: string, id: string) {
  await transactionService.deleteTransaction(userId, id);
}

export async function listSources(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit, 100);
  const { rows, count } = await IncomeSource.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('sources', rows, count, page, limit);
}

export async function createSource(userId: string, data: CreateSourceInput) {
  return IncomeSource.create({ userId, ...data });
}
