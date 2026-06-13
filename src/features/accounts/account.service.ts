import { FinancialAccount } from '../../models';
import { AppError } from '../../utils/errors';

export async function listAccounts(userId: string) {
  return FinancialAccount.findAll({
    where: { userId, isActive: true },
    order: [['createdAt', 'DESC']],
  });
}

export async function createAccount(
  userId: string,
  data: {
    name: string;
    type: 'bank' | 'credit_card' | 'cash' | 'wallet';
    institution?: string;
    accountNumberLast4?: string;
    balance: number;
    creditLimit?: number;
    currency?: string;
  }
) {
  return FinancialAccount.create({
    userId,
    currency: data.currency ?? 'INR',
    ...data,
  });
}

export async function updateAccount(
  userId: string,
  id: string,
  data: {
    name?: string;
    balance?: number;
    creditLimit?: number;
    isActive?: boolean;
  }
) {
  const account = await FinancialAccount.findOne({ where: { id, userId } });
  if (!account) throw new AppError(404, 'Account not found');
  await account.update(data);
  return account;
}
