import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import { Transaction, Category, IncomeSource, Budget } from '@database/models';
import { getNoSpendStreak } from '@shared/modules/expenses/service/transaction.service';
import { getBudgetDateRange } from '@shared/budgets/budgetPeriod';
import type { ReportFilters } from '../types';

/**
 * Shared data-fetcher for all report formats (CSV, PDF, Excel).
 * Avoids duplicate query logic across export formats.
 */
export async function fetchReportTransactions(
  userId: string,
  filters: ReportFilters = {}
): Promise<Transaction[]> {
  const where: Record<string, unknown> = { userId };

  // Date filtering
  let startDate = filters.startDate;
  let endDate = filters.endDate;
  let categoryId = filters.categoryId;

  // Budget filter handling: constrain to category or budget period if not otherwise specified
  if (filters.budgetId) {
    const budget = await Budget.findOne({ where: { id: filters.budgetId, userId } });
    if (budget) {
      if (budget.categoryId && !categoryId) {
        categoryId = budget.categoryId;
      }
      if (!startDate && !endDate) {
        const range = getBudgetDateRange(budget);
        startDate = range.startDate;
        endDate = range.endDate;
      }
    }
  }

  if (startDate || endDate) {
    const dateCondition: Record<symbol, unknown> = {};
    if (startDate) dateCondition[Op.gte] = startDate;
    if (endDate) dateCondition[Op.lte] = endDate;
    where.date = dateCondition;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (filters.incomeSourceId) {
    where.incomeSourceId = filters.incomeSourceId;
  }

  if (filters.type) {
    where.type = filters.type;
  }

  return Transaction.findAll({
    where,
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name'] },
      { model: IncomeSource, as: 'incomeSource', attributes: ['id', 'name'] },
    ],
    order: [['date', 'ASC']],
  });
}

/**
 * CSV report generation.
 */
export async function generateCsvReport(
  userId: string,
  filters: ReportFilters = {}
): Promise<string> {
  const transactions = await fetchReportTransactions(userId, filters);

  const header = 'Date,Type,Amount,Currency,Category,Income Source,Merchant,Payment Method,Notes\n';
  const rows = transactions
    .map((t) => {
      const cat = (t as Transaction & { category?: Category }).category?.name ?? '';
      const inc = (t as Transaction & { incomeSource?: IncomeSource }).incomeSource?.name ?? '';
      const dateStr = t.date ? new Date(t.date).toISOString().slice(0, 10) : '';
      return [
        dateStr,
        t.type,
        t.amount,
        t.currency,
        `"${cat.replace(/"/g, '""')}"`,
        `"${inc.replace(/"/g, '""')}"`,
        `"${(t.merchant ?? '').replace(/"/g, '""')}"`,
        t.paymentMethod ?? '',
        `"${(t.notes ?? '').replace(/"/g, '""')}"`,
      ].join(',');
    })
    .join('\n');

  return header + rows;
}

/**
 * Styled Excel report generation using ExcelJS.
 */
export async function generateExcelReport(
  userId: string,
  filters: ReportFilters = {}
): Promise<Buffer> {
  const transactions = await fetchReportTransactions(userId, filters);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BudgetBrain';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Transactions Report');

  worksheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Amount', key: 'amount', width: 16 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Income Source', key: 'incomeSource', width: 22 },
    { header: 'Merchant', key: 'merchant', width: 25 },
    { header: 'Payment Method', key: 'paymentMethod', width: 18 },
    { header: 'Notes', key: 'notes', width: 35 },
  ];

  // Header row styling
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Dark slate
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  let totalExpenses = 0;
  let totalIncome = 0;

  for (const t of transactions) {
    const amountNum = Number(t.amount);
    if (t.type === 'expense') totalExpenses += amountNum;
    else if (t.type === 'income') totalIncome += amountNum;

    const row = worksheet.addRow({
      date: t.date ? new Date(t.date).toISOString().slice(0, 10) : '',
      type: t.type.toUpperCase(),
      amount: amountNum,
      currency: t.currency,
      category: (t as Transaction & { category?: Category }).category?.name ?? '',
      incomeSource: (t as Transaction & { incomeSource?: IncomeSource }).incomeSource?.name ?? '',
      merchant: t.merchant ?? '',
      paymentMethod: t.paymentMethod ?? '',
      notes: t.notes ?? '',
    });

    // Color-code amounts: red for expenses, green for income
    const amountCell = row.getCell('amount');
    amountCell.numFmt = '#,##0.00';
    if (t.type === 'expense') {
      amountCell.font = { color: { argb: 'FFDC2626' } };
    } else {
      amountCell.font = { color: { argb: 'FF16A34A' } };
    }
  }

  // Summary rows
  worksheet.addRow([]);
  const summaryIncomeRow = worksheet.addRow({
    date: 'TOTAL INCOME',
    amount: totalIncome,
  });
  summaryIncomeRow.font = { bold: true };
  summaryIncomeRow.getCell('amount').numFmt = '#,##0.00';
  summaryIncomeRow.getCell('amount').font = { bold: true, color: { argb: 'FF16A34A' } };

  const summaryExpenseRow = worksheet.addRow({
    date: 'TOTAL EXPENSES',
    amount: totalExpenses,
  });
  summaryExpenseRow.font = { bold: true };
  summaryExpenseRow.getCell('amount').numFmt = '#,##0.00';
  summaryExpenseRow.getCell('amount').font = { bold: true, color: { argb: 'FFDC2626' } };

  const netSavings = totalIncome - totalExpenses;
  const summaryNetRow = worksheet.addRow({
    date: 'NET SAVINGS',
    amount: netSavings,
  });
  summaryNetRow.font = { bold: true };
  summaryNetRow.getCell('amount').numFmt = '#,##0.00';
  summaryNetRow.getCell('amount').font = {
    bold: true,
    color: { argb: netSavings >= 0 ? 'FF16A34A' : 'FFDC2626' },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Current-month highlights for the shareable spending recap.
 */
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
