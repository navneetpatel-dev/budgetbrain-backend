import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type TransactionType = 'expense' | 'income';
export type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'other';

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
  searchVector: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionCreationAttributes = Optional<
  TransactionAttributes,
  | 'id'
  | 'categoryId'
  | 'incomeSourceId'
  | 'notes'
  | 'merchant'
  | 'paymentMethod'
  | 'isRecurring'
  | 'recurringRule'
  | 'searchVector'
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
  declare searchVector: string | null;
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
        type: DataTypes.ENUM('expense', 'income'),
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
      notes: DataTypes.TEXT,
      merchant: DataTypes.STRING(255),
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      paymentMethod: {
        type: DataTypes.ENUM('cash', 'card', 'upi', 'bank_transfer', 'other'),
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
      searchVector: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: 'search_vector',
      },
    },
    {
      sequelize,
      tableName: 'transactions',
      indexes: [
        { fields: ['user_id', 'date'] },
        { fields: ['user_id', 'type'] },
        { fields: ['category_id'] },
      ],
    }
  );
  return Transaction;
}
