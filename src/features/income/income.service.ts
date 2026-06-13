import * as transactionService from '../expenses/transaction.service';
import { IncomeSource } from '../../models';
import { AppError } from '../../utils/errors';

export async function listIncome(
  userId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }
) {
  return transactionService.listTransactions(userId, { ...filters, type: 'income' });
}

export async function createIncome(
  userId: string,
  data: {
    amount: number;
    currency?: string;
    incomeSourceId?: string;
    notes?: string;
    date: string;
    isRecurring?: boolean;
    recurringRule?: string;
  }
) {
  return transactionService.createTransaction(userId, { ...data, type: 'income' });
}

export async function updateIncome(
  userId: string,
  id: string,
  data: {
    amount?: number;
    notes?: string;
    date?: string;
    incomeSourceId?: string;
  }
) {
  const transaction = await transactionService.updateTransaction(userId, id, data);
  if (transaction.type !== 'income') {
    throw new AppError(404, 'Income not found');
  }
  return transaction;
}

export async function deleteIncome(userId: string, id: string) {
  await transactionService.deleteTransaction(userId, id);
}

export async function listSources(userId: string) {
  return IncomeSource.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
}

export async function createSource(
  userId: string,
  data: {
    name: string;
    type: 'salary' | 'freelancing' | 'investments' | 'rental' | 'other';
    isRecurring?: boolean;
    recurringRule?: string;
  }
) {
  return IncomeSource.create({ userId, ...data });
}
