import { DataTypes, Model, Op, Optional, Sequelize } from 'sequelize';

/**
 * `refund` and `transfer` are kept apart from income and expense so they never inflate
 * income or spending totals (spec §8–12, implementation plan decision D-1).
 */
export type TransactionType = 'expense' | 'income' | 'refund' | 'transfer';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'wallet' | 'other';
export type TransactionSubtype = 'cashback' | 'reversal' | 'card_bill' | 'p2p' | 'self_transfer' | 'wallet_topup';
/** Which side of the account a transfer leg is on. Required for transfers, null otherwise. */
export type TransactionDirection = 'DEBIT' | 'CREDIT';
export type TransactionSource = 'manual' | 'detected' | 'import' | 'open_banking';

export const TRANSACTION_TYPES: readonly TransactionType[] = ['expense', 'income', 'refund', 'transfer'];
export const TRANSACTION_SUBTYPES: readonly TransactionSubtype[] = [
  'cashback',
  'reversal',
  'card_bill',
  'p2p',
  'self_transfer',
  'wallet_topup',
];

export interface TransactionAttributes {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId: string | null;
  incomeSourceId: string | null;
  notes: string | null;
  merchant: string | null;
  date: Date;
  paymentMethod: PaymentMethod | null;
  isRecurring: boolean;
  recurringRule: string | null;
  recurringSeriesId: string | null;
  financialAccountId?: string | null;
  tags: string[] | null;
  searchVector: string | null;
  taxWithheld: number | null;
  netAmount: number | null;
  subtype: TransactionSubtype | null;
  direction: TransactionDirection | null;
  refundOfTransactionId: string | null;
  transferGroupId: string | null;
  source: TransactionSource;
  detectedTransactionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionCreationAttributes = Optional<
  TransactionAttributes,
  | 'id'
  | 'categoryId'
  | 'incomeSourceId'
  | 'financialAccountId'
  | 'notes'
  | 'merchant'
  | 'paymentMethod'
  | 'isRecurring'
  | 'recurringRule'
  | 'recurringSeriesId'
  | 'tags'
  | 'searchVector'
  | 'taxWithheld'
  | 'netAmount'
  | 'subtype'
  | 'direction'
  | 'refundOfTransactionId'
  | 'transferGroupId'
  | 'source'
  | 'detectedTransactionId'
>;

export class Transaction
  extends Model<TransactionAttributes, TransactionCreationAttributes>
  implements TransactionAttributes
{
  declare id: string;
  declare userId: string;
  declare type: TransactionType;
  declare amount: number;
  declare currency: string;
  declare categoryId: string | null;
  declare incomeSourceId: string | null;
  declare notes: string | null;
  declare merchant: string | null;
  declare date: Date;
  declare paymentMethod: PaymentMethod | null;
  declare isRecurring: boolean;
  declare recurringRule: string | null;
  declare recurringSeriesId: string | null;
  declare financialAccountId: string | null;
  declare tags: string[] | null;
  declare searchVector: string | null;
  declare taxWithheld: number | null;
  declare netAmount: number | null;
  declare subtype: TransactionSubtype | null;
  declare direction: TransactionDirection | null;
  declare refundOfTransactionId: string | null;
  declare transferGroupId: string | null;
  declare source: TransactionSource;
  declare detectedTransactionId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initTransactionModel(sequelize: Sequelize): typeof Transaction {
  Transaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      type: {
        type: DataTypes.ENUM('expense', 'income', 'refund', 'transfer'),
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'category_id',
      },
      incomeSourceId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'income_source_id',
      },
      financialAccountId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'financial_account_id',
      },
      notes: DataTypes.TEXT,
      merchant: DataTypes.STRING(255),
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'upi', 'bank_transfer', 'wallet', 'other'),
        allowNull: true,
        field: 'payment_method',
      },
      isRecurring: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_recurring',
      },
      recurringRule: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'recurring_rule',
      },
      recurringSeriesId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'recurring_series_id',
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING(30)),
        allowNull: true,
        defaultValue: [],
      },
      searchVector: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'search_vector',
      },
      taxWithheld: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        field: 'tax_withheld',
      },
      netAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        field: 'net_amount',
      },
      subtype: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      direction: {
        type: DataTypes.STRING(6),
        allowNull: true,
      },
      refundOfTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'refund_of_transaction_id',
      },
      transferGroupId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'transfer_group_id',
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'manual',
      },
      detectedTransactionId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'detected_transaction_id',
      },
    },
    {
      sequelize,
      tableName: 'transactions',
      indexes: [
        { fields: ['user_id', 'date'] },
        { fields: ['user_id', 'type'] },
        { fields: ['category_id'] },
        { fields: ['financial_account_id'] },
        {
          name: 'idx_transactions_user_transfer_group',
          fields: ['user_id', 'transfer_group_id'],
          where: { transfer_group_id: { [Op.ne]: null } },
        },
      ],
    }
  );
  return Transaction;
}

export function associateTransaction(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  const { Category } = require('./category.model') as typeof import('./category.model');
  const { IncomeSource } = require('./incomeSource.model') as typeof import('./incomeSource.model');
  const { FinancialAccount } = require('./financialAccount.model') as typeof import('./financialAccount.model');
  const { TransactionAttachment } = require('./transactionAttachment.model') as typeof import('./transactionAttachment.model');
  const { RecurringSeries } = require('./recurringSeries.model') as typeof import('./recurringSeries.model');
  const { ExpenseSplitParticipant } = require('./expenseSplitParticipant.model') as typeof import('./expenseSplitParticipant.model');

  Transaction.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Transaction.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Transaction.belongsTo(IncomeSource, { foreignKey: 'incomeSourceId', as: 'incomeSource' });
  Transaction.belongsTo(FinancialAccount, { foreignKey: 'financialAccountId', as: 'financialAccount' });
  Transaction.hasMany(TransactionAttachment, { foreignKey: 'transactionId', as: 'attachments' });
  Transaction.belongsTo(RecurringSeries, { foreignKey: 'recurringSeriesId', as: 'recurringSeries' });
  Transaction.hasMany(ExpenseSplitParticipant, { foreignKey: 'transactionId', as: 'splitParticipants' });
  Transaction.belongsTo(Transaction, { foreignKey: 'refundOfTransactionId', as: 'refundOf' });
}
