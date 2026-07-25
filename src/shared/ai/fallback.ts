import type { FinanceContextResult } from './context/buildFinanceContext';

function money(currency: string, amount: number): string {
  const rounded = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `${currency} ${rounded}`;
}

function monthSnapshot(
  currency: string,
  summary: FinanceContextResult['summary']
): string[] {
  const lines = [
    `Here's your month so far:`,
    `• Income: ${money(currency, summary.incomeThisMonth)}`,
    `• Expenses: ${money(currency, summary.expensesThisMonth)}`,
    `• Net: ${money(currency, summary.netThisMonth)}`,
  ];

  if (summary.expenseChangePercent > 5) {
    lines.push(
      `Spending is about ${Math.round(summary.expenseChangePercent)}% higher than last month.`
    );
  } else if (summary.expenseChangePercent < -5) {
    lines.push(
      `Spending is about ${Math.abs(Math.round(summary.expenseChangePercent))}% lower than last month.`
    );
  }

  if (summary.topCategories.length) {
    lines.push('Top categories:');
    for (const cat of summary.topCategories.slice(0, 3)) {
      lines.push(`• ${cat.name}: ${money(currency, cat.total)}`);
    }
  }

  return lines;
}

/**
 * Context-aware reply when OPENAI_API_KEY is missing or the provider call fails.
 * Answers common finance questions from the user snapshot without exposing server config.
 */
export function generateCoachFallback(
  message: string,
  context?: Pick<FinanceContextResult, 'currency' | 'summary'>
): string {
  const lower = message.toLowerCase();
  const currency = context?.currency || 'INR';
  const summary = context?.summary;

  if (!summary) {
    if (lower.includes('budget')) {
      return 'Set category budgets for your top spending areas — Food, Transport, and Entertainment are usually the best place to start.';
    }
    if (lower.includes('save') || lower.includes('saving') || lower.includes('goal')) {
      return 'Pick one savings goal and contribute a small fixed amount each week. Consistency beats large one-off deposits.';
    }
    return 'I do not have enough of your BudgetBrain data yet. Log a few income and expense entries, then ask me again.';
  }

  const asksIncome =
    /\bincome\b/.test(lower) ||
    /\bearn(ed|ings)?\b/.test(lower) ||
    lower.includes('money in') ||
    lower.includes('how much did i make');
  const asksExpense =
    /\bexpense(s)?\b/.test(lower) ||
    /\bspend(ing|t)?\b/.test(lower) ||
    lower.includes('overspend') ||
    lower.includes('where did i');
  const asksNet =
    /\bnet\b/.test(lower) ||
    lower.includes('left over') ||
    lower.includes('leftover') ||
    lower.includes('balance this month') ||
    (lower.includes('save') && lower.includes('how much'));

  if (asksIncome && !asksExpense) {
    return [
      'Income this month:',
      `• Income: ${money(currency, summary.incomeThisMonth)}`,
      `• Expenses: ${money(currency, summary.expensesThisMonth)}`,
      `• Net: ${money(currency, summary.netThisMonth)}`,
    ].join('\n');
  }

  if (asksNet && !asksExpense) {
    return [
      'Net this month:',
      `• Income: ${money(currency, summary.incomeThisMonth)}`,
      `• Expenses: ${money(currency, summary.expensesThisMonth)}`,
      `• Net: ${money(currency, summary.netThisMonth)}`,
      summary.netThisMonth > 0
        ? 'Consider moving part of that into a goal contribution while it is still available.'
        : 'Your expenses are ahead of income this month — review your top categories and pause non-essential spend.',
    ].join('\n');
  }

  if (asksExpense) {
    const lines = [
      'Spending this month:',
      `• Expenses: ${money(currency, summary.expensesThisMonth)}`,
      `• Income: ${money(currency, summary.incomeThisMonth)}`,
      `• Net: ${money(currency, summary.netThisMonth)}`,
    ];
    if (summary.expenseChangePercent > 5) {
      lines.push(
        `That is about ${Math.round(summary.expenseChangePercent)}% higher than last month.`
      );
    } else if (summary.expenseChangePercent < -5) {
      lines.push(
        `Nice — about ${Math.abs(Math.round(summary.expenseChangePercent))}% lower than last month.`
      );
    }
    if (summary.topCategories.length) {
      lines.push('Top categories:');
      for (const cat of summary.topCategories.slice(0, 3)) {
        lines.push(`• ${cat.name}: ${money(currency, cat.total)}`);
      }
      lines.push(
        `Tip: review Activity for ${summary.topCategories[0].name}, then set a budget just under that total.`
      );
    }
    return lines.join('\n');
  }

  if (lower.includes('budget')) {
    if (summary.topCategories[0]) {
      const top = summary.topCategories[0];
      return [
        `Your biggest category this month is ${top.name} at ${money(currency, top.total)}.`,
        `Create a budget a bit under that amount and track it for two weeks.`,
      ].join('\n');
    }
    return 'Set category-based budgets for your top spending areas, then check progress weekly.';
  }

  if (lower.includes('goal')) {
    return [
      `You have ${money(currency, summary.netThisMonth)} net so far this month.`,
      'Open Goals, pick one target, and contribute a small fixed amount weekly.',
    ].join('\n');
  }

  if (lower.includes('save') || lower.includes('saving')) {
    return [
      `Your net this month is ${money(currency, summary.netThisMonth)}.`,
      'Try moving 10–20% of income into a goal right after payday.',
      'Then cut one recurring item in your top spending category.',
    ].join('\n');
  }

  return monthSnapshot(currency, summary).join('\n');
}
