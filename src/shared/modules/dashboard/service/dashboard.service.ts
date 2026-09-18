import * as userService from '@shared/modules/users/service/user.service';
import * as transactionService from '@shared/modules/expenses/service/transaction.service';
import * as budgetService from '@shared/modules/budgets/service/budget.service';
import * as goalService from '@shared/modules/goals/service/goal.service';
import * as recurringService from '@shared/modules/recurring/service/recurringSeries.service';

export async function getDashboard(userId: string) {
  const user = await userService.getUser(userId);

  const [
    totalIncome,
    totalExpenses,
    recentTransactions,
    budgets,
    goals,
    categoryBreakdown,
    noSpendStreak,
    upcomingBills,
  ] = await Promise.all([
    transactionService.getTotalIncome(userId, user),
    transactionService.getTotalExpenses(userId, user),
    transactionService.getRecentTransactions(userId, user, 10),
    budgetService.listBudgetsForDashboard(userId, 3),
    goalService.listGoalsForDashboard(userId, 2),
    transactionService.getCategoryBreakdown(userId, user, 2),
    transactionService.getNoSpendStreak(userId),
    recurringService.listUpcomingForDashboard(userId, 3),
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
    noSpendStreak,
    upcomingBills,
  };
}
