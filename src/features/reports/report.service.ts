import { Op } from 'sequelize';
import { Transaction, Category } from '../../models';

export async function generateCsvReport(userId: string, startDate?: string, endDate?: string) {
  const where: Record<string, unknown> = { userId };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>)[Op.gte as unknown as string] = startDate;
    if (endDate) (where.date as Record<string, unknown>)[Op.lte as unknown as string] = endDate;
  }

  const transactions = await Transaction.findAll({
    where,
    include: [{ model: Category, as: 'category' }],
    order: [['date', 'ASC']],
  });

  const header = 'Date,Type,Amount,Currency,Category,Merchant,Notes,Payment Method\n';
  const rows = transactions
    .map((t) => {
      const cat = (t as Transaction & { category?: Category }).category?.name ?? '';
      return [
        t.date,
        t.type,
        t.amount,
        t.currency,
        `"${cat}"`,
        `"${t.merchant ?? ''}"`,
        `"${(t.notes ?? '').replace(/"/g, '""')}"`,
        t.paymentMethod ?? '',
      ].join(',');
    })
    .join('\n');

  return header + rows;
}
