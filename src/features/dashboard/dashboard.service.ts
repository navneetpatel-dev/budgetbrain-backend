import * as userService from '../users/user.service';
import * as transactionService from '../expenses/transaction.service';
import * as budgetService from '../budgets/budget.service';
import * as goalService from '../goals/goal.service';

export async function getDashboard(userId: string) {
  const user = await userService.getUser(userId);

  const [totalIncome, totalExpenses, recentTransactions, budgets, goals, categoryBreakdown] =
    await Promise.all([
      transactionService.getTotalIncome(userId, user),
      transactionService.getTotalExpenses(userId, user),
      transactionService.getRecentTransactions(userId, user, 10),
      budgetService.listBudgetsForDashboard(userId, 5),
      goalService.listGoalsForDashboard(userId, 5),
      transactionService.getCategoryBreakdown(userId, user),
    ]);

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  return {
    summary: {
      totalIncome,
      totalExpenses,
      netSavings,
      savingsRate: Math.round(savingsRate * 100) / 100,
      currency: user.currency,
    },
    recentTransactions,
    budgets,
    goals,
    categoryBreakdown,
  };
}
