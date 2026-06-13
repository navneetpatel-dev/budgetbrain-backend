import { Sequelize } from 'sequelize';
import { sequelize } from '../config/database';
import { initUserModel, User } from './User';
import { initRefreshTokenModel, RefreshToken } from './RefreshToken';
import { initDeviceModel, Device } from './Device';
import { initSubscriptionModel, Subscription } from './Subscription';
import { initTransactionModel, Transaction, TransactionAttributes } from './Transaction';
import { initTransactionAttachmentModel, TransactionAttachment } from './TransactionAttachment';
import { initCategoryModel, Category, DEFAULT_CATEGORIES } from './Category';
import { initIncomeSourceModel, IncomeSource } from './IncomeSource';
import { initBudgetModel, Budget } from './Budget';
import { initBudgetAlertModel, BudgetAlert } from './BudgetAlert';
import { initGoalModel, Goal } from './Goal';
import { initGoalContributionModel, GoalContribution } from './GoalContribution';
import { initNotificationModel, Notification } from './Notification';
import { initFamilyGroupModel, FamilyGroup } from './FamilyGroup';
import { initFamilyMemberModel, FamilyMember } from './FamilyMember';
import { initAiConversationModel, AiConversation } from './AiConversation';
import { initAuditLogModel, AuditLog } from './AuditLog';
import { initFinancialAccountModel, FinancialAccount } from './FinancialAccount';
import { initInvestmentModel, Investment } from './Investment';
import { initParsedTransactionModel, ParsedTransaction } from './ParsedTransaction';

export function initModels(db: Sequelize = sequelize): void {
  initUserModel(db);
  initRefreshTokenModel(db);
  initDeviceModel(db);
  initSubscriptionModel(db);
  initTransactionModel(db);
  initTransactionAttachmentModel(db);
  initCategoryModel(db);
  initIncomeSourceModel(db);
  initBudgetModel(db);
  initBudgetAlertModel(db);
  initGoalModel(db);
  initGoalContributionModel(db);
  initNotificationModel(db);
  initFamilyGroupModel(db);
  initFamilyMemberModel(db);
  initAiConversationModel(db);
  initAuditLogModel(db);
  initFinancialAccountModel(db);
  initInvestmentModel(db);
  initParsedTransactionModel(db);

  User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
  RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(Device, { foreignKey: 'userId', as: 'devices' });
  Device.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
  Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
  Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Transaction.hasMany(TransactionAttachment, { foreignKey: 'transactionId', as: 'attachments' });
  TransactionAttachment.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

  User.hasMany(Category, { foreignKey: 'userId', as: 'categories' });
  Category.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Transaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Category.hasMany(Transaction, { foreignKey: 'categoryId', as: 'transactions' });

  User.hasMany(IncomeSource, { foreignKey: 'userId', as: 'incomeSources' });
  IncomeSource.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Transaction.belongsTo(IncomeSource, { foreignKey: 'incomeSourceId', as: 'incomeSource' });
  IncomeSource.hasMany(Transaction, { foreignKey: 'incomeSourceId', as: 'transactions' });

  User.hasMany(Budget, { foreignKey: 'userId', as: 'budgets' });
  Budget.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Budget.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

  Budget.hasMany(BudgetAlert, { foreignKey: 'budgetId', as: 'alerts' });
  BudgetAlert.belongsTo(Budget, { foreignKey: 'budgetId', as: 'budget' });

  User.hasMany(Goal, { foreignKey: 'userId', as: 'goals' });
  Goal.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  Goal.hasMany(GoalContribution, { foreignKey: 'goalId', as: 'contributions' });
  GoalContribution.belongsTo(Goal, { foreignKey: 'goalId', as: 'goal' });

  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(FamilyGroup, { foreignKey: 'ownerId', as: 'ownedGroups' });
  FamilyGroup.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

  FamilyGroup.hasMany(FamilyMember, { foreignKey: 'groupId', as: 'members' });
  FamilyMember.belongsTo(FamilyGroup, { foreignKey: 'groupId', as: 'group' });
  FamilyMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(AiConversation, { foreignKey: 'userId', as: 'aiConversations' });
  AiConversation.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
  AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(FinancialAccount, { foreignKey: 'userId', as: 'financialAccounts' });
  FinancialAccount.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(Investment, { foreignKey: 'userId', as: 'investments' });
  Investment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  User.hasMany(ParsedTransaction, { foreignKey: 'userId', as: 'parsedTransactions' });
  ParsedTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  ParsedTransaction.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
}

export {
  sequelize,
  User,
  RefreshToken,
  Device,
  Subscription,
  Transaction,
  TransactionAttributes,
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
  DEFAULT_CATEGORIES,
  FinancialAccount,
  Investment,
  ParsedTransaction,
};
