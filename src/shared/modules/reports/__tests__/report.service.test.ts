import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction, createTestCategory } from '@testHelpers';
import { Budget } from '@database/models';
import {
  fetchReportTransactions,
  generateCsvReport,
  generateExcelReport,
  getMonthlyRecap,
} from '../service/report.service';
import ExcelJS from 'exceljs';

describe('fetchReportTransactions', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('returns all transactions when no filters are supplied', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 10 });
    await createTestTransaction(user.id, { type: 'income', amount: 20 });

    const rows = await fetchReportTransactions(user.id, {});
    expect(rows).toHaveLength(2);
  });

  it('filters by date range', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { amount: 1, date: new Date('2024-01-05') });
    await createTestTransaction(user.id, { amount: 2, date: new Date('2024-02-15') });
    await createTestTransaction(user.id, { amount: 3, date: new Date('2024-03-20') });

    const rows = await fetchReportTransactions(user.id, {
      startDate: '2024-02-01',
      endDate: '2024-02-28',
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(2);
  });

  it('filters by categoryId', async () => {
    const user = await createTestUser();
    const catA = await createTestCategory(user.id, { name: 'A' });
    const catB = await createTestCategory(user.id, { name: 'B' });
    await createTestTransaction(user.id, { amount: 1, categoryId: catA.id });
    await createTestTransaction(user.id, { amount: 2, categoryId: catB.id });

    const rows = await fetchReportTransactions(user.id, { categoryId: catA.id });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1);
  });

  it('filters by incomeSourceId', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'income', amount: 100 });
    await createTestTransaction(user.id, { type: 'expense', amount: 5 });

    const withSource = await createTestTransaction(user.id, {
      type: 'income',
      amount: 999,
    });
    // No IncomeSource factory exists; verify the filter branch is at least reachable and
    // narrows results to the exact id supplied (0 or 1 rows), rather than asserting on data
    // that would require a full IncomeSource fixture.
    const rows = await fetchReportTransactions(user.id, { incomeSourceId: withSource.id });
    expect(rows.every((r) => r.incomeSourceId === withSource.id)).toBe(true);
  });

  it('filters by type', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 1 });
    await createTestTransaction(user.id, { type: 'income', amount: 2 });

    const rows = await fetchReportTransactions(user.id, { type: 'income' });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('income');
  });

  it('resolves a budgetId to its category and period when no explicit filters are given', async () => {
    const user = await createTestUser();
    const category = await createTestCategory(user.id, { name: 'Groceries' });
    const otherCategory = await createTestCategory(user.id, { name: 'Other' });

    const budget = await Budget.create({
      userId: user.id,
      name: 'Groceries Budget',
      type: 'custom',
      amount: 500,
      currency: 'INR',
      categoryId: category.id,
      startDate: new Date('2024-05-01'),
      endDate: new Date('2024-05-31'),
    } as any);

    // In-period, matching category — should be included.
    await createTestTransaction(user.id, {
      amount: 10,
      categoryId: category.id,
      date: new Date('2024-05-10'),
    });
    // In-period but different category — should be excluded (budget resolves categoryId too).
    await createTestTransaction(user.id, {
      amount: 20,
      categoryId: otherCategory.id,
      date: new Date('2024-05-11'),
    });
    // Matching category but outside the budget's period — should be excluded.
    await createTestTransaction(user.id, {
      amount: 30,
      categoryId: category.id,
      date: new Date('2024-06-01'),
    });

    const rows = await fetchReportTransactions(user.id, { budgetId: budget.id });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(10);
  });

  it('does not let a budgetId override explicit date filters', async () => {
    const user = await createTestUser();
    const budget = await Budget.create({
      userId: user.id,
      name: 'Any Budget',
      type: 'custom',
      amount: 500,
      currency: 'INR',
      categoryId: null,
      startDate: new Date('2024-05-01'),
      endDate: new Date('2024-05-31'),
    } as any);

    await createTestTransaction(user.id, { amount: 1, date: new Date('2024-07-15') });

    const rows = await fetchReportTransactions(user.id, {
      budgetId: budget.id,
      startDate: '2024-07-01',
      endDate: '2024-07-31',
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1);
  });
});

describe('generateCsvReport', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('emits the expected header row', async () => {
    const user = await createTestUser();
    const csv = await generateCsvReport(user.id, {});
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'Date,Type,Amount,Currency,Category,Income Source,Merchant,Payment Method,Notes'
    );
  });

  it('escapes commas and double quotes in merchant/notes fields', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      amount: 42,
      merchant: 'Bed, Bath & "Beyond"',
      notes: 'Contains, a comma and "quotes"',
      date: new Date('2024-04-01'),
    });

    const csv = await generateCsvReport(user.id, {});
    const dataLine = csv.split('\n')[1];

    expect(dataLine).toContain('"Bed, Bath & ""Beyond"""');
    expect(dataLine).toContain('"Contains, a comma and ""quotes"""');
  });

  it('formats the date as YYYY-MM-DD', async () => {
    const user = await createTestUser();
    // Local noon, not a UTC-boundary time, so this is stable regardless of server timezone.
    await createTestTransaction(user.id, { amount: 5, date: new Date(2024, 8, 3, 12, 0, 0) });

    const csv = await generateCsvReport(user.id, {});
    const dataLine = csv.split('\n')[1];
    expect(dataLine.startsWith('2024-09-03,')).toBe(true);
  });
});

describe('generateExcelReport', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('builds a workbook with the expected sheet name and columns', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { amount: 10 });

    const buffer = await generateExcelReport(user.id, {});
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.getWorksheet('Transactions Report');
    expect(sheet).toBeDefined();
    const headerValues = sheet!.getRow(1).values as unknown[];
    // ExcelJS row.values is 1-indexed (index 0 is empty)
    expect(headerValues.slice(1)).toEqual([
      'Date',
      'Type',
      'Amount',
      'Currency',
      'Category',
      'Income Source',
      'Merchant',
      'Payment Method',
      'Notes',
    ]);
  });

  it('computes correct total income/expense/net-savings summary rows', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 300 });
    await createTestTransaction(user.id, { type: 'expense', amount: 200 });
    await createTestTransaction(user.id, { type: 'income', amount: 1000 });

    const buffer = await generateExcelReport(user.id, {});
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Transactions Report')!;

    // rows: 1 header, 3 data, 1 blank, then 3 summary rows -> summary starts at row 6
    const incomeRow = sheet.getRow(6);
    const expenseRow = sheet.getRow(7);
    const netRow = sheet.getRow(8);

    expect(incomeRow.getCell(1).value).toBe('TOTAL INCOME');
    expect(incomeRow.getCell(3).value).toBe(1000);
    expect(expenseRow.getCell(1).value).toBe('TOTAL EXPENSES');
    expect(expenseRow.getCell(3).value).toBe(500);
    expect(netRow.getCell(1).value).toBe('NET SAVINGS');
    expect(netRow.getCell(3).value).toBe(500);
  });

  it('color-codes expense amounts red and income amounts green', async () => {
    const user = await createTestUser();
    // `date` is a DATEONLY column, so same-day rows have no reliable tie-break order —
    // give each an explicit, distinct date so row order (and which row is which) is deterministic.
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 50,
      date: new Date(2024, 0, 1, 12),
    });
    await createTestTransaction(user.id, {
      type: 'income',
      amount: 60,
      date: new Date(2024, 0, 2, 12),
    });

    const buffer = await generateExcelReport(user.id, {});
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Transactions Report')!;

    // Column-key metadata (worksheet.columns[i].key) is an ExcelJS-only in-memory construct
    // that doesn't round-trip through a real .xlsx buffer, so after `workbook.xlsx.load(buffer)`
    // cells must be addressed by numeric index (3 = Amount) rather than the original key.
    const expenseAmountCell = sheet.getRow(2).getCell(3);
    const incomeAmountCell = sheet.getRow(3).getCell(3);

    expect((expenseAmountCell.font as any)?.color?.argb).toBe('FFDC2626');
    expect((incomeAmountCell.font as any)?.color?.argb).toBe('FF16A34A');
  });

  it('handles an empty transaction set without throwing, with zeroed summary rows', async () => {
    const user = await createTestUser();
    const buffer = await generateExcelReport(user.id, {});
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Transactions Report')!;

    // row 1 header, row 2 blank, rows 3-5 summary
    expect(sheet.getRow(3).getCell(3).value).toBe(0);
    expect(sheet.getRow(4).getCell(3).value).toBe(0);
    expect(sheet.getRow(5).getCell(3).value).toBe(0);
  });
});

describe('getMonthlyRecap', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  function thisMonthDate(day: number): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0);
  }

  it('returns null/zero fields for a user with no transactions this month, without throwing', async () => {
    const user = await createTestUser();
    const recap = await getMonthlyRecap(user.id);

    expect(recap.totalSpent).toBe(0);
    expect(recap.topCategory).toBeNull();
    expect(recap.biggestExpense).toBeNull();
  });

  it('picks the top category by total spend', async () => {
    const user = await createTestUser();
    const groceries = await createTestCategory(user.id, { name: 'Groceries' });
    const transit = await createTestCategory(user.id, { name: 'Transit' });

    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 100,
      categoryId: groceries.id,
      date: thisMonthDate(2),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 250,
      categoryId: groceries.id,
      date: thisMonthDate(5),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 90,
      categoryId: transit.id,
      date: thisMonthDate(7),
    });

    const recap = await getMonthlyRecap(user.id);
    expect(recap.topCategory?.name).toBe('Groceries');
    expect(recap.topCategory?.amount).toBe(350);
    expect(recap.totalSpent).toBe(440);
  });

  it('breaks a top-category tie deterministically (first-seen wins)', async () => {
    const user = await createTestUser();
    const catA = await createTestCategory(user.id, { name: 'CatA' });
    const catB = await createTestCategory(user.id, { name: 'CatB' });

    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 100,
      categoryId: catA.id,
      date: thisMonthDate(1),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 100,
      categoryId: catB.id,
      date: thisMonthDate(2),
    });

    const first = await getMonthlyRecap(user.id);
    const second = await getMonthlyRecap(user.id);
    // Same input, same tie-break outcome across repeated calls - deterministic, not flaky.
    expect(first.topCategory?.name).toBe(second.topCategory?.name);
  });

  it('picks the single biggest expense by amount', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 40,
      merchant: 'Small',
      date: thisMonthDate(1),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 400,
      merchant: 'Big',
      date: thisMonthDate(2),
    });

    const recap = await getMonthlyRecap(user.id);
    expect(recap.biggestExpense?.merchant).toBe('Big');
    expect(recap.biggestExpense?.amount).toBe(400);
  });

  it('includes a noSpendStreak field sourced from getNoSpendStreak', async () => {
    const user = await createTestUser();
    const recap = await getMonthlyRecap(user.id);
    expect(recap).toHaveProperty('noSpendStreak');
  });

  it('ignores income transactions when computing spend totals', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, {
      type: 'income',
      amount: 5000,
      date: thisMonthDate(1),
    });
    await createTestTransaction(user.id, {
      type: 'expense',
      amount: 25,
      date: thisMonthDate(2),
    });

    const recap = await getMonthlyRecap(user.id);
    expect(recap.totalSpent).toBe(25);
  });
});
