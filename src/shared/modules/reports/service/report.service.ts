import { Op } from 'sequelize';
import ExcelJS from 'exceljs';
import { Transaction, Category, IncomeSource, Budget, User } from '@database/models';
import { getNoSpendStreak } from '@shared/modules/expenses/service/expenses.service';
import { getBudgetDateRange } from '@shared/budgets/budgetPeriod';
import { convertAndSum, getExchangeRate, roundMoney } from '@shared/currency/currency.engine';
import { AppError } from '@shared/errors';
import { reportQueue, type ReportJobData } from '@queue/queues';
import { getSignedDownloadUrl } from '@core/storage/s3.service';
import type { ReportFilters } from '../reports.types';
import { toNetSpendingRows } from '@shared/modules/expenses/service/transactionKinds';

export type ReportExportFormat = ReportJobData['format'];

async function resolveUserCurrency(userId: string): Promise<string> {
  const user = await User.findByPk(userId, { attributes: ['currency'] });
  return user?.currency ?? 'INR';
}

/** Convert mixed-currency report rows into the user's display currency, then sum. */
export async function sumConvertedIncomeAndExpense(
  userId: string,
  transactions: Array<{ type: string; amount: unknown; currency?: string | null }>
): Promise<{ currency: string; totalIncome: number; totalExpenses: number }> {
  const currency = await resolveUserCurrency(userId);
  const totalIncome = await convertAndSum(
    transactions.filter((t) => t.type === 'income'),
    currency
  );
  // Net of refunds; transfers appear in the report rows but in neither total.
  const totalExpenses = await convertAndSum(toNetSpendingRows(transactions), currency);
  return { currency, totalIncome, totalExpenses };
}

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
    // Every export format only ever reads these columns (see generateCsvReport /
    // generateExcelReport / sumConvertedIncomeAndExpense below) — restricting them cuts
    // payload size for a query that, unlike most list endpoints, has no row-count cap
    // (an export must cover the user's whole filtered history).
    attributes: [
      'id',
      'type',
      'amount',
      'currency',
      'date',
      'merchant',
      'paymentMethod',
      'notes',
      'categoryId',
      'incomeSourceId',
    ],
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

  const { currency, totalIncome, totalExpenses } = await sumConvertedIncomeAndExpense(
    userId,
    transactions
  );

  for (const t of transactions) {
    const amountNum = Number(t.amount);

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

    // Color-code amounts: red for expenses, green for income and refunds, grey for transfers
    const amountCell = row.getCell('amount');
    amountCell.numFmt = '#,##0.00';
    if (t.type === 'expense') {
      amountCell.font = { color: { argb: 'FFDC2626' } };
    } else if (t.type === 'transfer') {
      amountCell.font = { color: { argb: 'FF6B7280' } };
    } else {
      amountCell.font = { color: { argb: 'FF16A34A' } };
    }
  }

  // Summary rows
  worksheet.addRow([]);
  const summaryIncomeRow = worksheet.addRow({
    date: 'TOTAL INCOME',
    amount: totalIncome,
    currency,
  });
  summaryIncomeRow.font = { bold: true };
  summaryIncomeRow.getCell('amount').numFmt = '#,##0.00';
  summaryIncomeRow.getCell('amount').font = { bold: true, color: { argb: 'FF16A34A' } };

  const summaryExpenseRow = worksheet.addRow({
    date: 'TOTAL EXPENSES',
    amount: totalExpenses,
    currency,
  });
  summaryExpenseRow.font = { bold: true };
  summaryExpenseRow.getCell('amount').numFmt = '#,##0.00';
  summaryExpenseRow.getCell('amount').font = { bold: true, color: { argb: 'FFDC2626' } };

  const netSavings = totalIncome - totalExpenses;
  const summaryNetRow = worksheet.addRow({
    date: 'NET SAVINGS',
    amount: netSavings,
    currency,
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
    attributes: ['id', 'merchant', 'amount', 'currency', 'categoryId'],
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
  });

  const currency = await resolveUserCurrency(userId);
  // One getExchangeRate call per distinct currency present, not one convertAmount call per
  // row — the per-row converted amount is still needed here (topCategory/biggestExpense
  // compare individual rows), so this can't collapse into a single convertAndSum total the
  // way getTransactionsSummary's SQL aggregation does.
  const currencies = new Set(transactions.map((t) => t.currency || currency));
  const rateEntries = await Promise.all(
    [...currencies].map(async (c) => [c, c === currency ? 1 : await getExchangeRate(c, currency)] as const)
  );
  const rateMap = new Map(rateEntries);
  const convertedRows = transactions.map((t) => ({
    merchant: t.merchant,
    categoryName: (t as Transaction & { category?: Category }).category?.name ?? 'Uncategorized',
    amount: roundMoney(Number(t.amount) * (rateMap.get(t.currency || currency) ?? 1)),
  }));

  const totalSpent = roundMoney(convertedRows.reduce((sum, row) => sum + row.amount, 0));

  const byCategory = new Map<string, number>();
  for (const row of convertedRows) {
    byCategory.set(row.categoryName, (byCategory.get(row.categoryName) ?? 0) + row.amount);
  }
  let topCategory: { name: string; amount: number } | null = null;
  for (const [name, amount] of byCategory) {
    const rounded = roundMoney(amount);
    if (!topCategory || rounded > topCategory.amount) topCategory = { name, amount: rounded };
  }

  let biggestExpense: { merchant: string | null; amount: number } | null = null;
  for (const row of convertedRows) {
    if (!biggestExpense || row.amount > biggestExpense.amount) {
      biggestExpense = { merchant: row.merchant, amount: row.amount };
    }
  }

  const noSpendStreak = await getNoSpendStreak(userId);

  return { periodStart: startDate, periodEnd: endDate, totalSpent, topCategory, biggestExpense, noSpendStreak };
}

/** Enqueues a report generation job on the BullMQ `report` queue (see @queue/workers/report.worker.ts,
 * which does the actual generation + S3 upload) and returns the job id for polling via
 * getReportJobStatus. Never generates synchronously on the request path. */
export async function enqueueReportExport(
  userId: string,
  format: ReportExportFormat,
  filters: ReportFilters
): Promise<string> {
  const job = await reportQueue.add(format, { userId, format, filters: filters as Record<string, unknown> });
  if (!job.id) {
    throw new AppError(500, 'Failed to enqueue report export', 'REPORT_ENQUEUE_FAILED');
  }
  return job.id;
}

export interface ReportExportStatus {
  status: 'pending' | 'active' | 'completed' | 'failed';
  downloadUrl?: string;
  fileName?: string;
}

/** A fresh presigned URL is minted on every poll of a completed job — never cache the URL
 * itself, since it expires in SIGNED_URL_EXPIRES_IN (15 min, see core/storage/s3.service.ts). */
export async function getReportJobStatus(userId: string, jobId: string): Promise<ReportExportStatus> {
  const job = await reportQueue.getJob(jobId);
  // Never leak another user's job by a guessable id — treat a userId mismatch the same as "not found".
  if (!job || job.data.userId !== userId) {
    throw new AppError(404, 'Export job not found', 'REPORT_JOB_NOT_FOUND');
  }

  const state = await job.getState();
  if (state === 'completed' && job.returnvalue) {
    const { s3Key, fileName } = job.returnvalue;
    const downloadUrl = await getSignedDownloadUrl(s3Key);
    return { status: 'completed', downloadUrl, fileName };
  }
  if (state === 'failed') {
    return { status: 'failed' };
  }
  if (state === 'active') {
    return { status: 'active' };
  }
  return { status: 'pending' };
}
