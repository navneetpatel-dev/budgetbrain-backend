import { Budget, Category, User } from '../../models';
import { AppError } from '../../utils/errors';

const FREE_BUDGET_LIMIT = 3;

export async function createBudget(
  userId: string,
  data: {
    name: string;
    type: 'monthly' | 'weekly' | 'category';
    amount: number;
    currency?: string;
    categoryId?: string;
    startDate: string;
    endDate?: string;
    alertThreshold?: number;
  }
) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');

  if (user.role === 'free') {
    const count = await Budget.count({ where: { userId } });
    if (count >= FREE_BUDGET_LIMIT) {
      throw new AppError(403, 'Free plan limited to 3 budgets', 'LIMIT_REACHED');
    }
  }

  return Budget.create({
    userId,
    name: data.name,
    type: data.type,
    amount: data.amount,
    currency: data.currency ?? user.currency,
    categoryId: data.categoryId ?? null,
    startDate: new Date(data.startDate),
    endDate: data.endDate ? new Date(data.endDate) : null,
    alertThreshold: data.alertThreshold ?? 80,
  });
}

export async function listBudgets(userId: string) {
  return Budget.findAll({
    where: { userId },
    include: [{ model: Category, as: 'category' }],
    order: [['createdAt', 'DESC']],
  });
}

export async function updateBudget(
  userId: string,
  id: string,
  data: {
    name?: string;
    amount?: number;
    alertThreshold?: number;
    endDate?: string;
  }
) {
  const budget = await Budget.findOne({ where: { id, userId } });
  if (!budget) throw new AppError(404, 'Budget not found');

  await budget.update({
    ...(data.name !== undefined && { name: data.name }),
    ...(data.amount !== undefined && { amount: data.amount }),
    ...(data.alertThreshold !== undefined && { alertThreshold: data.alertThreshold }),
    ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
  });

  return budget;
}

export async function deleteBudget(userId: string, id: string) {
  const budget = await Budget.findOne({ where: { id, userId } });
  if (!budget) throw new AppError(404, 'Budget not found');
  await budget.destroy();
}
