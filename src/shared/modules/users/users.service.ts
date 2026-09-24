import { userHash } from '@modules/transaction-detection/skeletons.service';
import { sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import {
  User,
  RefreshToken,
  Device,
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
  DetectedTransaction,
  SupportTicket,
  VerificationToken,
  MerchantCategoryRule,
  ExpenseSplitParticipant,
  Loan,
  LoanPayment,
  RecurringSeries,
  Subscription,
  AiUsageQuota,
  WebauthnCredential,
  FamilyInvite,
  IncomeAllocation,
  SsoHandoffToken,
} from '@database/models';
import { deleteCache } from '@core/cache/cache.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import type { OnboardingInput, UpdateProfileInput } from './users.types';

export async function getUser(userId: string) {
  const user = await User.findByPk(userId);
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

function profileAuditSnapshot(user: User, data: UpdateProfileInput) {
  const keys = Object.keys(data) as (keyof UpdateProfileInput)[];
  const fields =
    keys.length > 0
      ? keys
      : (['name', 'country', 'currency', 'avatarUrl', 'theme', 'accent'] as const);

  return Object.fromEntries(fields.map((key) => [key, user[key as keyof User]]));
}

export async function updateProfile(userId: string, data: UpdateProfileInput) {
  const user = await getUser(userId);
  const beforeState = profileAuditSnapshot(user, data);
  await user.update(data);
  void deleteCache(`user:session:${userId}`);
  await writeAuditLog({
    action: AuditAction.USER_UPDATE,
    resource: AuditResource.USER,
    resourceId: userId,
    actorUserId: userId,
    beforeState,
    afterState: profileAuditSnapshot(user, data),
  });
  return user;
}

export async function updateOnboarding(userId: string, data: OnboardingInput) {
  const user = await getUser(userId);
  await user.update({ ...data, onboardingCompleted: true });
  void deleteCache(`user:session:${userId}`);
  await writeAuditLog({
    action: AuditAction.USER_UPDATE,
    resource: AuditResource.USER,
    resourceId: userId,
    actorUserId: userId,
    metadata: { onboardingCompleted: true },
  });
  return user;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await sequelize.transaction(async (t) => {
    const txOpts = { transaction: t };

    await writeAuditLog({
      action: AuditAction.USER_DELETE,
      resource: AuditResource.USER,
      resourceId: userId,
      actorUserId: userId,
      severity: 'critical',
      metadata: { deletedAt: new Date().toISOString(), deletedUserId: userId },
      transaction: t,
    });

    // Keep immutable audit rows; clear FK so the user row can be removed.
    await AuditLog.update({ userId: null }, { where: { userId }, ...txOpts });

    const transactions = await Transaction.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const txIds = transactions.map((x) => x.id);

    const userAccounts = await FinancialAccount.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const accountIds = userAccounts.map((a) => a.id);

    if (txIds.length) {
      await IncomeAllocation.destroy({ where: { transactionId: txIds }, ...txOpts });
      await TransactionAttachment.destroy({ where: { transactionId: txIds }, ...txOpts });
      await ExpenseSplitParticipant.destroy({ where: { transactionId: txIds }, ...txOpts });
    }
    if (accountIds.length) {
      await IncomeAllocation.destroy({ where: { financialAccountId: accountIds }, ...txOpts });
    }

    await ExpenseSplitParticipant.destroy({ where: { userId }, ...txOpts });
    await MerchantCategoryRule.destroy({ where: { userId }, ...txOpts });
    await RecurringSeries.destroy({ where: { userId }, ...txOpts });

    const loans = await Loan.findAll({ where: { userId }, attributes: ['id'], ...txOpts });
    const loanIds = loans.map((l) => l.id);
    if (loanIds.length) {
      await LoanPayment.destroy({ where: { loanId: loanIds }, ...txOpts });
    }
    await Loan.destroy({ where: { userId }, ...txOpts });

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
      await FamilyInvite.destroy({ where: { groupId: groupIds }, ...txOpts });
      await FamilyMember.destroy({ where: { groupId: groupIds }, ...txOpts });
      await FamilyGroup.destroy({ where: { id: groupIds }, ...txOpts });
    }
    await FamilyInvite.destroy({ where: { invitedByUserId: userId }, ...txOpts });

    await FamilyMember.destroy({ where: { userId }, ...txOpts });
    await RefreshToken.destroy({ where: { userId }, ...txOpts });
    await Device.destroy({ where: { userId }, ...txOpts });
    await Transaction.destroy({ where: { userId }, ...txOpts });
    await Category.destroy({ where: { userId }, ...txOpts });
    await IncomeSource.destroy({ where: { userId }, ...txOpts });
    await Budget.destroy({ where: { userId }, ...txOpts });
    await GoalContribution.destroy({ where: { userId }, ...txOpts });
    await Goal.destroy({ where: { userId }, ...txOpts });
    await Notification.destroy({ where: { userId }, ...txOpts });
    await AiConversation.destroy({ where: { userId }, ...txOpts });
    await FinancialAccount.destroy({ where: { userId }, ...txOpts });
    await Investment.destroy({ where: { userId }, ...txOpts });
    // Detection data (plan T7.6). Skeletons are keyed by an HMAC of the id, so no FK covers them.
    await DetectedTransaction.destroy({ where: { userId }, ...txOpts });
    await sequelize.query(`DELETE FROM detection_diagnostics_daily WHERE user_id = :userId`, { replacements: { userId }, ...txOpts });
    await sequelize.query(`DELETE FROM detection_skeleton_submissions WHERE user_hash = :hash`, {
      replacements: { hash: userHash(userId) },
      ...txOpts,
    });
    await SupportTicket.destroy({ where: { userId }, ...txOpts });
    await VerificationToken.destroy({ where: { userId }, ...txOpts });
    await Subscription.destroy({ where: { userId }, ...txOpts });
    await AiUsageQuota.destroy({ where: { userId }, ...txOpts });
    await WebauthnCredential.destroy({ where: { userId }, ...txOpts });
    await SsoHandoffToken.destroy({ where: { userId }, ...txOpts });

    await User.destroy({ where: { id: userId }, ...txOpts });
  });
  void deleteCache(`user:session:${userId}`);
}
