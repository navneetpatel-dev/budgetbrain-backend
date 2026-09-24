import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type DetectedTransactionDirection = 'DEBIT' | 'CREDIT';
export type DetectedTransactionType = 'expense' | 'income' | 'refund' | 'transfer';
export type DetectedTransactionSource =
  | 'android_sms'
  | 'notification'
  | 'email'
  | 'pasted_sms'
  | 'csv'
  | 'ofx'
  | 'qif'
  | 'mt940'
  | 'camt053'
  | 'open_banking'
  | 'bank_api';
export type DetectedTransactionStatus =
  | 'auto_approved'
  | 'pending_review'
  | 'user_confirmed'
  | 'rejected'
  | 'duplicate';

export interface DetectedTransactionAttributes {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  direction: DetectedTransactionDirection;
  transactionType: DetectedTransactionType;
  merchant: string | null;
  normalizedMerchant: string | null;
  categoryId: string | null;
  financialAccountId: string | null;
  accountTail: string | null;
  referenceNumber: string | null;
  institutionName: string | null;
  transactionDate: Date;
  confidence: number;
  dedupFingerprint: string;
  source: DetectedTransactionSource;
  status: DetectedTransactionStatus;
  createdTransactionId: string | null;
  metadata: Record<string, unknown> | null;
  /** Knowledge-pack institution id, e.g. `in.hdfc_bank` (replaces the raw sender, gap X6). */
  institutionId: string | null;
  subtype: string | null;
  paymentMethod: string | null;
  /** Why the item needs review (reason code), when status is `pending_review`. */
  reviewReason: string | null;
  /** Evidence flags the server scored (gap F3). */
  evidence: Record<string, boolean | string> | null;
  confidenceTier: 'high' | 'medium' | 'low' | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DetectedTransactionCreationAttributes = Optional<
  DetectedTransactionAttributes,
  | 'id'
  | 'currency'
  | 'merchant'
  | 'normalizedMerchant'
  | 'categoryId'
  | 'financialAccountId'
  | 'accountTail'
  | 'referenceNumber'
  | 'institutionName'
  | 'confidence'
  | 'source'
  | 'status'
  | 'createdTransactionId'
  | 'metadata'
  | 'institutionId'
  | 'subtype'
  | 'paymentMethod'
  | 'reviewReason'
  | 'evidence'
  | 'confidenceTier'
>;

export class DetectedTransaction
  extends Model<DetectedTransactionAttributes, DetectedTransactionCreationAttributes>
  implements DetectedTransactionAttributes
{
  declare id: string;
  declare userId: string;
  declare amount: number;
  declare currency: string;
  declare direction: DetectedTransactionDirection;
  declare transactionType: DetectedTransactionType;
  declare merchant: string | null;
  declare normalizedMerchant: string | null;
  declare categoryId: string | null;
  declare financialAccountId: string | null;
  declare accountTail: string | null;
  declare referenceNumber: string | null;
  declare institutionName: string | null;
  declare transactionDate: Date;
  declare confidence: number;
  declare dedupFingerprint: string;
  declare source: DetectedTransactionSource;
  declare status: DetectedTransactionStatus;
  declare createdTransactionId: string | null;
  declare metadata: Record<string, unknown> | null;
  declare institutionId: string | null;
  declare subtype: string | null;
  declare paymentMethod: string | null;
  declare reviewReason: string | null;
  declare evidence: Record<string, boolean | string> | null;
  declare confidenceTier: 'high' | 'medium' | 'low' | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initDetectedTransactionModel(sequelize: Sequelize): typeof DetectedTransaction {
  DetectedTransaction.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), defaultValue: 'INR', allowNull: false },
      direction: { type: DataTypes.STRING(10), allowNull: false },
      transactionType: {
        type: DataTypes.STRING(20),
        defaultValue: 'expense',
        allowNull: false,
        field: 'transaction_type',
      },
      merchant: { type: DataTypes.STRING(255), allowNull: true },
      normalizedMerchant: { type: DataTypes.STRING(255), allowNull: true, field: 'normalized_merchant' },
      categoryId: { type: DataTypes.UUID, allowNull: true, field: 'category_id' },
      financialAccountId: { type: DataTypes.UUID, allowNull: true, field: 'financial_account_id' },
      accountTail: { type: DataTypes.STRING(10), allowNull: true, field: 'account_tail' },
      referenceNumber: { type: DataTypes.STRING(100), allowNull: true, field: 'reference_number' },
      institutionName: { type: DataTypes.STRING(100), allowNull: true, field: 'institution_name' },
      transactionDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'transaction_date' },
      confidence: { type: DataTypes.FLOAT, defaultValue: 0.0, allowNull: false },
      // Core fingerprints are `v2_` + 64 hex characters.
      dedupFingerprint: { type: DataTypes.STRING(80), allowNull: false, field: 'dedup_fingerprint' },
      source: { type: DataTypes.STRING(20), defaultValue: 'android_sms', allowNull: false },
      status: { type: DataTypes.STRING(20), defaultValue: 'auto_approved', allowNull: false },
      createdTransactionId: { type: DataTypes.UUID, allowNull: true, field: 'created_transaction_id' },
      metadata: { type: DataTypes.JSONB, allowNull: true },
      institutionId: { type: DataTypes.STRING(100), allowNull: true, field: 'institution_id' },
      subtype: { type: DataTypes.STRING(20), allowNull: true },
      paymentMethod: { type: DataTypes.STRING(20), allowNull: true, field: 'payment_method' },
      reviewReason: { type: DataTypes.STRING(40), allowNull: true, field: 'review_reason' },
      evidence: { type: DataTypes.JSONB, allowNull: true },
      confidenceTier: { type: DataTypes.STRING(10), allowNull: true, field: 'confidence_tier' },
    },
    {
      sequelize,
      tableName: 'detected_transactions',
      indexes: [
        { unique: true, fields: ['user_id', 'dedup_fingerprint'] },
        { fields: ['user_id', 'transaction_date'] },
        { fields: ['user_id', 'status'] },
        { fields: ['created_transaction_id'] },
        { fields: ['category_id'] },
        { fields: ['financial_account_id'] },
      ],
    }
  );
  return DetectedTransaction;
}

export function associateDetectedTransaction(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  const { Transaction } = require('./transaction.model') as typeof import('./transaction.model');
  const { Category } = require('./category.model') as typeof import('./category.model');
  const { FinancialAccount } = require('./financialAccount.model') as typeof import('./financialAccount.model');

  DetectedTransaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  DetectedTransaction.belongsTo(Transaction, { foreignKey: 'createdTransactionId', as: 'createdTransaction' });
  DetectedTransaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  DetectedTransaction.belongsTo(FinancialAccount, { foreignKey: 'financialAccountId', as: 'financialAccount' });
}
