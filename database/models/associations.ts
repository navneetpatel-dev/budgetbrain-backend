import { User } from './user.model';
import { RefreshToken } from './refreshToken.model';
import { Device } from './device.model';
import { Transaction } from './transaction.model';
import { TransactionAttachment } from './transactionAttachment.model';
import { Category } from './category.model';
import { IncomeSource } from './incomeSource.model';
import { Budget } from './budget.model';
import { BudgetAlert } from './budgetAlert.model';
import { Goal } from './goal.model';
import { GoalContribution } from './goalContribution.model';
import { Notification } from './notification.model';
import { FamilyGroup } from './familyGroup.model';
import { FamilyMember } from './familyMember.model';
import { AiConversation } from './aiConversation.model';
import { AuditLog } from './auditLog.model';
import { FinancialAccount } from './financialAccount.model';
import { Investment } from './investment.model';
import { SupportTicket } from './supportTicket.model';
import { VerificationToken } from './verificationToken.model';
import { MerchantCategoryRule } from './merchantCategoryRule.model';
import { ExpenseSplitParticipant } from './expenseSplitParticipant.model';
import { Loan } from './loan.model';
import { LoanPayment } from './loanPayment.model';
import { RecurringSeries } from './recurringSeries.model';
import { Subscription } from './subscription.model';
import { AiUsageQuota } from './aiUsageQuota.model';
import { WebauthnCredential } from './webauthnCredential.model';
import { IncomeAllocation } from './incomeAllocation.model';
import { FamilyInvite } from './familyInvite.model';
import { DetectedTransaction } from './detectedTransaction.model';

export function initAssociations(): void {
  // User associations
  User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
  User.hasMany(Device, { foreignKey: 'userId', as: 'devices' });
  User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
  User.hasMany(Category, { foreignKey: 'userId', as: 'categories' });
  User.hasMany(IncomeSource, { foreignKey: 'userId', as: 'incomeSources' });
  User.hasMany(Budget, { foreignKey: 'userId', as: 'budgets' });
  User.hasMany(Goal, { foreignKey: 'userId', as: 'goals' });
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  User.hasMany(FamilyGroup, { foreignKey: 'ownerId', as: 'ownedGroups' });
  User.hasMany(AiConversation, { foreignKey: 'userId', as: 'aiConversations' });
  User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
  User.hasMany(FinancialAccount, { foreignKey: 'userId', as: 'financialAccounts' });
  User.hasMany(Investment, { foreignKey: 'userId', as: 'investments' });
  User.hasMany(SupportTicket, { foreignKey: 'userId', as: 'supportTickets' });
  User.hasMany(VerificationToken, { foreignKey: 'userId', as: 'verificationTokens' });
  User.hasMany(MerchantCategoryRule, { foreignKey: 'userId', as: 'merchantCategoryRules' });
  User.hasMany(Loan, { foreignKey: 'userId', as: 'loans' });
  User.hasMany(RecurringSeries, { foreignKey: 'userId', as: 'recurringSeries' });
  User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
  User.hasMany(DetectedTransaction, { foreignKey: 'userId', as: 'detectedTransactions' });

  // BelongsTo User
  RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Device.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Category.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Investment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  SupportTicket.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  VerificationToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  AiConversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // IncomeSource
  IncomeSource.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  IncomeSource.hasMany(Transaction, { foreignKey: 'incomeSourceId', as: 'transactions' });

  // Budget & Alerts
  Budget.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Budget.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Budget.hasMany(BudgetAlert, { foreignKey: 'budgetId', as: 'alerts' });
  BudgetAlert.belongsTo(Budget, { foreignKey: 'budgetId', as: 'budget' });
  BudgetAlert.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Goal & Contributions
  Goal.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Goal.hasMany(GoalContribution, { foreignKey: 'goalId', as: 'contributions' });
  GoalContribution.belongsTo(Goal, { foreignKey: 'goalId', as: 'goal' });
  GoalContribution.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Family
  // FamilyGroup<->FamilyMember association is already declared inline in
  // familyMember.model.ts (foreignKey: 'groupId', matching the real `group_id`
  // column). A duplicate association here using a mismatched 'familyGroupId'
  // foreign key previously caused Sequelize to auto-inject a phantom
  // `family_group_id` attribute/column that was never migrated, breaking any
  // plain FamilyMember.create() call outright. Do not redeclare it here.
  FamilyGroup.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
  FamilyMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // FinancialAccount
  FinancialAccount.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Loan & Payments
  Loan.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Loan.hasMany(LoanPayment, { foreignKey: 'loanId', as: 'payments' });
  LoanPayment.belongsTo(Loan, { foreignKey: 'loanId', as: 'loan' });

  // MerchantCategoryRule
  MerchantCategoryRule.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  MerchantCategoryRule.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

  // RecurringSeries
  RecurringSeries.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  RecurringSeries.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  RecurringSeries.hasMany(Transaction, { foreignKey: 'recurringSeriesId', as: 'transactions' });

  // Transaction & Attachments & Splits
  Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Transaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Transaction.belongsTo(IncomeSource, { foreignKey: 'incomeSourceId', as: 'incomeSource' });
  Transaction.hasMany(TransactionAttachment, { foreignKey: 'transactionId', as: 'attachments' });
  Transaction.belongsTo(RecurringSeries, { foreignKey: 'recurringSeriesId', as: 'recurringSeries' });
  Transaction.hasMany(ExpenseSplitParticipant, { foreignKey: 'transactionId', as: 'splitParticipants' });
  Transaction.hasMany(IncomeAllocation, { foreignKey: 'transactionId', as: 'incomeAllocations' });
  Transaction.belongsTo(FinancialAccount, { foreignKey: 'financialAccountId', as: 'financialAccount' });
  TransactionAttachment.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
  ExpenseSplitParticipant.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
  IncomeAllocation.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
  IncomeAllocation.belongsTo(FinancialAccount, { foreignKey: 'financialAccountId', as: 'financialAccount' });
  FinancialAccount.hasMany(IncomeAllocation, { foreignKey: 'financialAccountId', as: 'incomeAllocations' });
  FinancialAccount.hasMany(Transaction, { foreignKey: 'financialAccountId', as: 'transactions' });

  // AiUsageQuota
  AiUsageQuota.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(AiUsageQuota, { foreignKey: 'userId', as: 'aiUsageQuotas' });

  // WebauthnCredential
  WebauthnCredential.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(WebauthnCredential, { foreignKey: 'userId', as: 'webauthnCredentials' });

  // FamilyInvite
  FamilyInvite.belongsTo(User, { foreignKey: 'invitedByUserId', as: 'invitedBy' });
  FamilyInvite.belongsTo(FamilyGroup, { foreignKey: 'groupId', as: 'group' });
  FamilyGroup.hasMany(FamilyInvite, { foreignKey: 'groupId', as: 'invites' });

  // DetectedTransaction
  DetectedTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  DetectedTransaction.belongsTo(Transaction, { foreignKey: 'createdTransactionId', as: 'createdTransaction' });
  DetectedTransaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  DetectedTransaction.belongsTo(FinancialAccount, { foreignKey: 'financialAccountId', as: 'financialAccount' });
  Transaction.hasOne(DetectedTransaction, { foreignKey: 'createdTransactionId', as: 'sourceDetection' });
}
