import { Investment } from '../../../../shared/models';
import { AppError } from '../../../shared/utils/errors';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type { CreateInvestmentInput, UpdateInvestmentInput, EnrichedInvestment } from '../types';

function enrichInvestment(inv: Investment): EnrichedInvestment {
  const json = inv.toJSON() as EnrichedInvestment;
  return {
    ...json,
    currentValue: Number(inv.quantity) * Number(inv.currentPrice),
    gainLoss:
      Number(inv.quantity) * Number(inv.currentPrice) -
      Number(inv.quantity) * Number(inv.purchasePrice),
  };
}

export async function listInvestments(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await Investment.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  const investments = rows.map(enrichInvestment);
  return paginatedResult('investments', investments, count, page, limit);
}

export async function createInvestment(userId: string, data: CreateInvestmentInput) {
  return Investment.create({
    userId,
    currency: data.currency ?? 'INR',
    ...data,
    currentPrice: data.currentPrice ?? data.purchasePrice,
    purchaseDate: new Date(data.purchaseDate),
  });
}

export async function updateInvestment(
  userId: string,
  id: string,
  data: UpdateInvestmentInput
) {
  const investment = await Investment.findOne({ where: { id, userId } });
  if (!investment) throw new AppError(404, 'Investment not found');
  await investment.update(data);
  return investment;
}
