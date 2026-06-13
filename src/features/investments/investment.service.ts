import { Investment } from '../../models';
import { AppError } from '../../utils/errors';

export interface EnrichedInvestment {
  id: string;
  userId: string;
  name: string;
  type: Investment['type'];
  symbol: string | null;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  currency: string;
  purchaseDate: Date;
  createdAt: Date;
  updatedAt: Date;
  currentValue: number;
  gainLoss: number;
}

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

export async function listInvestments(userId: string): Promise<EnrichedInvestment[]> {
  const investments = await Investment.findAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
  return investments.map(enrichInvestment);
}

export async function createInvestment(
  userId: string,
  data: {
    name: string;
    type: 'stocks' | 'mutual_fund' | 'fd' | 'crypto' | 'gold' | 'other';
    symbol?: string;
    quantity: number;
    purchasePrice: number;
    currentPrice?: number;
    currency?: string;
    purchaseDate: string;
  }
) {
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
  data: { currentPrice: number; quantity?: number }
) {
  const investment = await Investment.findOne({ where: { id, userId } });
  if (!investment) throw new AppError(404, 'Investment not found');
  await investment.update(data);
  return investment;
}
