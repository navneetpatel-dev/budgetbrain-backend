import { Sequelize } from 'sequelize';
import { sequelize } from '../config/database';
import { initUserModel, User, associateUser } from './user.model';
import { initRefreshTokenModel, RefreshToken, associateRefreshToken } from './refreshToken.model';
import { initDeviceModel, Device, associateDevice } from './device.model';
import { initTransactionModel, Transaction, TransactionAttributes, associateTransaction } from './transaction.model';
import { initTransactionAttachmentModel, TransactionAttachment, associateTransactionAttachment } from './transactionAttachment.model';
import { initCategoryModel, Category, DEFAULT_CATEGORIES, associateCategory } from './category.model';
import { initIncomeSourceModel, IncomeSource, associateIncomeSource } from './incomeSource.model';
import { initBudgetModel, Budget, associateBudget } from './budget.model';
import { initBudgetAlertModel, BudgetAlert, associateBudgetAlert } from './budgetAlert.model';
import { initGoalModel, Goal, associateGoal } from './goal.model';
import { initGoalContributionModel, GoalContribution, associateGoalContribution } from './goalContribution.model';
import { initNotificationModel, Notification, NotificationType, associateNotification } from './notification.model';
import { initFamilyGroupModel, FamilyGroup, associateFamilyGroup } from './familyGroup.model';
import { initFamilyMemberModel, FamilyMember, associateFamilyMember } from './familyMember.model';
import { initAiConversationModel, AiConversation, associateAiConversation } from './aiConversation.model';
import { initAuditLogModel, AuditLog, associateAuditLog } from './auditLog.model';
import { initFinancialAccountModel, FinancialAccount, associateFinancialAccount } from './financialAccount.model';
import { initInvestmentModel, Investment, associateInvestment } from './investment.model';
import { initParsedTransactionModel, ParsedTransaction, associateParsedTransaction } from './parsedTransaction.model';
import { initSupportTicketModel, SupportTicket, associateSupportTicket } from './supportTicket.model';
import { initVerificationTokenModel, VerificationToken, TokenType, associateVerificationToken } from './verificationToken.model';
import {
  initMerchantCategoryRuleModel,
  MerchantCategoryRule,
  associateMerchantCategoryRule,
} from './merchantCategoryRule.model';
import {
  initExpenseSplitParticipantModel,
  ExpenseSplitParticipant,
  associateExpenseSplitParticipant,
} from './expenseSplitParticipant.model';
import { initLoanModel, Loan, associateLoan } from './loan.model';
import { initLoanPaymentModel, LoanPayment, associateLoanPayment } from './loanPayment.model';
import { initRecurringSeriesModel, RecurringSeries, associateRecurringSeries } from './recurringSeries.model';
import { initSubscriptionModel, Subscription, associateSubscription } from './subscription.model';
import { initExchangeRate, ExchangeRate } from './exchangeRate.model';
import { initAiUsageQuotaModel, AiUsageQuota, associateAiUsageQuota } from './aiUsageQuota.model';
import { initWebauthnCredentialModel, WebauthnCredential } from './webauthnCredential.model';
import { initIncomeAllocationModel, IncomeAllocation } from './incomeAllocation.model';
import { initFamilyInviteModel, FamilyInvite } from './familyInvite.model';
import { initSsoHandoffTokenModel, SsoHandoffToken } from './ssoHandoffToken.model';
import {
  initDetectedTransactionModel,
  DetectedTransaction,
  associateDetectedTransaction,
} from './detectedTransaction.model';
import { initAssociations } from './associations';

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
  initMerchantCategoryRuleModel(db);
  initExpenseSplitParticipantModel(db);
  initLoanModel(db);
  initLoanPaymentModel(db);
  initRecurringSeriesModel(db);
  initSubscriptionModel(db);
  initExchangeRate(db);
  initAiUsageQuotaModel(db);
  initWebauthnCredentialModel(db);
  initFamilyInviteModel(db);
  initIncomeAllocationModel(db);
  initSsoHandoffTokenModel(db);
  initDetectedTransactionModel(db);

  initAssociations();
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
  MerchantCategoryRule,
  ExpenseSplitParticipant,
  Loan,
  LoanPayment,
  RecurringSeries,
  Subscription,
  ExchangeRate,
  AiUsageQuota,
  WebauthnCredential,
  FamilyInvite,
  IncomeAllocation,
  SsoHandoffToken,
  DetectedTransaction,
};

export type { TokenType, NotificationType };
export type { LoanType } from './loan.model';
export type {
  TransactionType,
  TransactionSubtype,
  TransactionDirection,
  TransactionSource,
  PaymentMethod,
} from './transaction.model';
export type { BudgetRolloverMode } from './budget.model';
export type { RecurringCadence, RecurringSeriesSource } from './recurringSeries.model';
export type { AiMessage } from './aiConversation.model';
export type { TicketStatus } from './supportTicket.model';
export type {
  SubscriptionStatus,
  SubscriptionPlan,
  SubscriptionStore,
  SubscriptionAttributes,
  SubscriptionCreationAttributes,
} from './subscription.model';
export type {
  DetectedTransactionAttributes,
  DetectedTransactionCreationAttributes,
  DetectedTransactionDirection,
  DetectedTransactionType,
  DetectedTransactionStatus,
  DetectedTransactionSource,
} from './detectedTransaction.model';

