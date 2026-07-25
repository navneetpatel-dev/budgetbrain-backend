import { Op, fn, col } from 'sequelize';
import { User, Transaction, Category, Budget, Goal } from '../../models';
import { AI_COACH_CONFIG } from '../config';

export interface FinanceContextResult {
  currency: string;
  userName: string | null;
  text: string;
  summary: {
    incomeThisMonth: number;
    expensesThisMonth: number;
    netThisMonth: number;
    expenseChangePercent: number;
    topCategories: Array<{ name: string; total: number }>;
  };
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function pct(current: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.round((current / target) * 100);
}

/**
 * Builds a compact, privacy-safe finance snapshot for the coach model.
 */
export async function buildFinanceContext(userId: string): Promise<FinanceContextResult> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    user,
    incomeThisMonth,
    expensesThisMonth,
    expensesLastMonth,
    byCategory,
    budgets,
    goals,
    recentTransactions,
  ] = await Promise.all([
    User.findByPk(userId, {
      attributes: ['name', 'currency', 'country', 'monthlySavingsTarget', 'salaryRange', 'financialGoals'],
    }),
    Transaction.sum('amount', {
      where: { userId, type: 'income', date: { [Op.gte]: thisMonthStart } },
    }),
    Transaction.sum('amount', {
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
    }),
    Transaction.sum('amount', {
      where: {
        userId,
        type: 'expense',
        date: { [Op.gte]: lastMonthStart, [Op.lte]: lastMonthEnd },
      },
    }),
    Transaction.findAll({
      where: { userId, type: 'expense', date: { [Op.gte]: thisMonthStart } },
      attributes: ['categoryId', [fn('SUM', col('amount')), 'total']],
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      group: ['categoryId', 'category.id', 'category.name'],
      raw: true,
    }),
    Budget.findAll({
      where: { userId },
      attributes: ['name', 'type', 'amount', 'currency', 'startDate', 'endDate'],
      order: [['updatedAt', 'DESC']],
      limit: AI_COACH_CONFIG.budgetsLimit,
    }),
    Goal.findAll({
      where: { userId, completedAt: null },
      attributes: ['name', 'type', 'currentAmount', 'targetAmount', 'currency', 'targetDate'],
      order: [['updatedAt', 'DESC']],
      limit: AI_COACH_CONFIG.goalsLimit,
    }),
    Transaction.findAll({
      where: { userId },
      attributes: ['type', 'amount', 'currency', 'merchant', 'date', 'notes'],
      include: [{ model: Category, as: 'category', attributes: ['name'] }],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit: AI_COACH_CONFIG.recentTransactionsLimit,
    }),
  ]);

  const currency = user?.currency || 'INR';
  const userName = user?.name ?? null;
  const income = Number(incomeThisMonth ?? 0);
  const expenses = Number(expensesThisMonth ?? 0);
  const previousExpenses = Number(expensesLastMonth ?? 0);
  const net = income - expenses;
  const expenseChangePercent =
    previousExpenses > 0 ? ((expenses - previousExpenses) / previousExpenses) * 100 : 0;

  const topCategories = [...byCategory]
    .map((row) => {
      const r = row as unknown as {
        total: string;
        'category.name'?: string;
        category?: { name?: string };
      };
      return {
        name: r['category.name'] || r.category?.name || 'Uncategorized',
        total: Number(r.total ?? 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, AI_COACH_CONFIG.topCategoriesLimit);

  const lines: string[] = [];
  lines.push('## Profile');
  lines.push(`- Name: ${userName || 'Unknown'}`);
  lines.push(`- Currency: ${currency}`);
  if (user?.country) lines.push(`- Country: ${user.country}`);
  if (user?.monthlySavingsTarget != null) {
    lines.push(`- Monthly savings target: ${currency} ${Number(user.monthlySavingsTarget)}`);
  }
  if (user?.salaryRange) lines.push(`- Salary range (self-reported): ${user.salaryRange}`);
  if (user?.financialGoals?.length) {
    lines.push(`- Onboarding goals: ${user.financialGoals.join(', ')}`);
  }

  lines.push('');
  lines.push('## This month summary');
  lines.push(`- Income: ${currency} ${income.toFixed(2)}`);
  lines.push(`- Expenses: ${currency} ${expenses.toFixed(2)}`);
  lines.push(`- Net: ${currency} ${net.toFixed(2)}`);
  lines.push(`- Expense change vs last month: ${expenseChangePercent.toFixed(1)}%`);

  lines.push('');
  lines.push('## Top expense categories (this month)');
  if (topCategories.length === 0) {
    lines.push('- None yet');
  } else {
    for (const cat of topCategories) {
      lines.push(`- ${cat.name}: ${currency} ${cat.total.toFixed(2)}`);
    }
  }

  lines.push('');
  lines.push('## Budgets (recent)');
  if (budgets.length === 0) {
    lines.push('- None');
  } else {
    for (const b of budgets) {
      const end = b.endDate ? ` → ${formatDate(b.endDate)}` : '';
      lines.push(
        `- ${b.name} (${b.type}): ${b.currency} ${Number(b.amount).toFixed(2)} from ${formatDate(b.startDate)}${end}`
      );
    }
  }

  lines.push('');
  lines.push('## Goals (active)');
  if (goals.length === 0) {
    lines.push('- None');
  } else {
    for (const g of goals) {
      const current = Number(g.currentAmount);
      const target = Number(g.targetAmount);
      const targetDate = g.targetDate ? `, target date ${formatDate(g.targetDate)}` : '';
      lines.push(
        `- ${g.name} (${g.type}): ${g.currency} ${current.toFixed(2)} / ${target.toFixed(2)} (${pct(current, target)}%${targetDate})`
      );
    }
  }

  lines.push('');
  lines.push('## Recent transactions');
  if (recentTransactions.length === 0) {
    lines.push('- None');
  } else {
    for (const t of recentTransactions) {
      const categoryName =
        (t as Transaction & { category?: { name?: string } }).category?.name || 'Uncategorized';
      const label = t.merchant || categoryName;
      lines.push(
        `- ${formatDate(t.date)} | ${t.type} | ${t.currency} ${Number(t.amount).toFixed(2)} | ${label}`
      );
    }
  }

  return {
    currency,
    userName,
    text: lines.join('\n'),
    summary: {
      incomeThisMonth: income,
      expensesThisMonth: expenses,
      netThisMonth: net,
      expenseChangePercent,
      topCategories,
    },
  };
}
