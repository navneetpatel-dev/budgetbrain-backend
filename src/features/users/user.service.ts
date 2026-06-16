import { sequelize } from '../../models';
import { AppError } from '../../utils/errors';
import {
  User,
  RefreshToken,
  Device,
  Subscription,
  Transaction,
  TransactionAttachment,
  Category,
  IncomeSource,
  Budget,
  BudgetAlert,
  Goal,
  GoalContribution,
  Notification,
  FamilyGroup,
  FamilyMember,
  AiConversation,
  AuditLog,
  FinancialAccount,
  Investment,
  ParsedTransaction,
  SupportTicket,
  VerificationToken,
} from '../../models';

export async function getUser(userId: string) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

export async function updateProfile(
  userId: string,
  data: {
    name?: string;
    country?: string;
    currency?: string;
    avatarUrl?: string;
    theme?: string;
    accent?: string;
  }
) {
  const user = await getUser(userId);
  await user.update(data);
  return user;
}

export async function updateOnboarding(
  userId: string,
  data: {
    name?: string;
    country?: string;
    currency?: string;
    financialGoals?: string[];
    salaryRange?: string;
    monthlySavingsTarget?: number;
  }
) {
  const user = await getUser(userId);
  await user.update({ ...data, onboardingCompleted: true });
  return user;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await sequelize.transaction(async (t) => {
    const txOpts = { transaction: t };

    const transactions = await Transaction.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const txIds = transactions.map((x) => x.id);
    if (txIds.length) {
      await TransactionAttachment.destroy({ where: { transactionId: txIds }, ...txOpts });
    }

    await BudgetAlert.destroy({ where: { userId }, ...txOpts });

    const budgets = await Budget.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const budgetIds = budgets.map((b) => b.id);
    if (budgetIds.length) {
      await BudgetAlert.destroy({ where: { budgetId: budgetIds }, ...txOpts });
    }

    const goals = await Goal.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const goalIds = goals.map((g) => g.id);
    if (goalIds.length) {
      await GoalContribution.destroy({ where: { goalId: goalIds }, ...txOpts });
    }

    const ownedGroups = await FamilyGroup.findAll({ where: { ownerId: userId }, attributes: ['id'], ...txOpts });
    const groupIds = ownedGroups.map((g) => g.id);
    if (groupIds.length) {
      await FamilyMember.destroy({ where: { groupId: groupIds }, ...txOpts });
      await FamilyGroup.destroy({ where: { id: groupIds }, ...txOpts });
    }

    await FamilyMember.destroy({ where: { userId }, ...txOpts });
    await RefreshToken.destroy({ where: { userId }, ...txOpts });
    await Device.destroy({ where: { userId }, ...txOpts });
    await Subscription.destroy({ where: { userId }, ...txOpts });
    await Transaction.destroy({ where: { userId }, ...txOpts });
    await Category.destroy({ where: { userId }, ...txOpts });
    await IncomeSource.destroy({ where: { userId }, ...txOpts });
    await Budget.destroy({ where: { userId }, ...txOpts });
    await GoalContribution.destroy({ where: { userId }, ...txOpts });
    await Goal.destroy({ where: { userId }, ...txOpts });
    await Notification.destroy({ where: { userId }, ...txOpts });
    await AiConversation.destroy({ where: { userId }, ...txOpts });
    await AuditLog.destroy({ where: { userId }, ...txOpts });
    await FinancialAccount.destroy({ where: { userId }, ...txOpts });
    await Investment.destroy({ where: { userId }, ...txOpts });
    await ParsedTransaction.destroy({ where: { userId }, ...txOpts });
    await SupportTicket.destroy({ where: { userId }, ...txOpts });
    await VerificationToken.destroy({ where: { userId }, ...txOpts });

    await User.destroy({ where: { id: userId }, ...txOpts });
  });
}
