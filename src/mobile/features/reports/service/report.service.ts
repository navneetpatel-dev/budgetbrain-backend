import { Op } from 'sequelize';
import { Transaction, Category } from '../../../../shared/models';
import { getNoSpendStreak } from '../../expenses/service/transaction.service';

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

/** Current-month highlights for the shareable spending recap. */
export async function getMonthlyRecap(userId: string) {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const transactions = await Transaction.findAll({
    where: { userId, type: 'expense', date: { [Op.gte]: startDate, [Op.lte]: endDate } },
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
  });

  const totalSpent = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    const categoryName = (t as Transaction & { category?: Category }).category?.name ?? 'Uncategorized';
    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + Number(t.amount));
  }
  let topCategory: { name: string; amount: number } | null = null;
  for (const [name, amount] of byCategory) {
    if (!topCategory || amount > topCategory.amount) topCategory = { name, amount };
  }

  let biggestExpense: { merchant: string | null; amount: number } | null = null;
  for (const t of transactions) {
    if (!biggestExpense || Number(t.amount) > biggestExpense.amount) {
      biggestExpense = { merchant: t.merchant, amount: Number(t.amount) };
    }
  }

  const noSpendStreak = await getNoSpendStreak(userId);

  return { periodStart: startDate, periodEnd: endDate, totalSpent, topCategory, biggestExpense, noSpendStreak };
}
