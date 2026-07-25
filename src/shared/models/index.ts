import { Sequelize } from 'sequelize';
import { sequelize } from '../db/database';
import { initUserModel, User, associateUser } from './User';
import { initRefreshTokenModel, RefreshToken, associateRefreshToken } from './RefreshToken';
import { initDeviceModel, Device, associateDevice } from './Device';
import { initTransactionModel, Transaction, TransactionAttributes, associateTransaction } from './Transaction';
import { initTransactionAttachmentModel, TransactionAttachment, associateTransactionAttachment } from './TransactionAttachment';
import { initCategoryModel, Category, DEFAULT_CATEGORIES, associateCategory } from './Category';
import { initIncomeSourceModel, IncomeSource, associateIncomeSource } from './IncomeSource';
import { initBudgetModel, Budget, associateBudget } from './Budget';
import { initBudgetAlertModel, BudgetAlert, associateBudgetAlert } from './BudgetAlert';
import { initGoalModel, Goal, associateGoal } from './Goal';
import { initGoalContributionModel, GoalContribution, associateGoalContribution } from './GoalContribution';
import { initNotificationModel, Notification, NotificationType, associateNotification } from './Notification';
import { initFamilyGroupModel, FamilyGroup, associateFamilyGroup } from './FamilyGroup';
import { initFamilyMemberModel, FamilyMember, associateFamilyMember } from './FamilyMember';
import { initAiConversationModel, AiConversation, associateAiConversation } from './AiConversation';
import { initAuditLogModel, AuditLog, associateAuditLog } from './AuditLog';
import { initFinancialAccountModel, FinancialAccount, associateFinancialAccount } from './FinancialAccount';
import { initInvestmentModel, Investment, associateInvestment } from './Investment';
import { initParsedTransactionModel, ParsedTransaction, associateParsedTransaction } from './ParsedTransaction';
import { initSupportTicketModel, SupportTicket, associateSupportTicket } from './SupportTicket';
import { initVerificationTokenModel, VerificationToken, TokenType, associateVerificationToken } from './VerificationToken';

export function initModels(db: Sequelize = sequelize): void {
  initUserModel(db);
  initRefreshTokenModel(db);
  initDeviceModel(db);
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
  initSupportTicketModel(db);
  initVerificationTokenModel(db);

  associateUser();
  associateRefreshToken();
  associateDevice();
  associateTransaction();
  associateTransactionAttachment();
  associateCategory();
  associateIncomeSource();
  associateBudget();
  associateBudgetAlert();
  associateGoal();
  associateGoalContribution();
  associateNotification();
  associateFamilyGroup();
  associateFamilyMember();
  associateAiConversation();
  associateAuditLog();
  associateFinancialAccount();
  associateInvestment();
  associateParsedTransaction();
  associateSupportTicket();
  associateVerificationToken();
}

export {
  sequelize,
  User,
  RefreshToken,
  Device,
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
  SupportTicket,
  VerificationToken,
};
export type { TokenType, NotificationType };
