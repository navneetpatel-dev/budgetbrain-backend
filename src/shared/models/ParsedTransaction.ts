import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type ParseSource = 'sms' | 'email';

export interface ParsedTransactionAttributes {
  id: string;
  userId: string;
  source: ParseSource;
  rawContent: string;
  parsedAmount: number | null;
  parsedMerchant: string | null;
  parsedDate: Date | null;
  confidence: number;
  status: 'pending' | 'confirmed' | 'rejected';
  transactionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ParsedTransactionCreationAttributes = Optional<
  ParsedTransactionAttributes,
  'id' | 'parsedAmount' | 'parsedMerchant' | 'parsedDate' | 'transactionId' | 'status'
>;

export class ParsedTransaction
  extends Model<ParsedTransactionAttributes, ParsedTransactionCreationAttributes>
  implements ParsedTransactionAttributes
{
  declare id: string;
  declare userId: string;
  declare source: ParseSource;
  declare rawContent: string;
  declare parsedAmount: number | null;
  declare parsedMerchant: string | null;
  declare parsedDate: Date | null;
  declare confidence: number;
  declare status: 'pending' | 'confirmed' | 'rejected';
  declare transactionId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initParsedTransactionModel(sequelize: Sequelize): typeof ParsedTransaction {
  ParsedTransaction.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      source: { type: DataTypes.ENUM('sms', 'email'), allowNull: false },
      rawContent: { type: DataTypes.TEXT, allowNull: false, field: 'raw_content' },
      parsedAmount: { type: DataTypes.DECIMAL(15, 2), allowNull: true, field: 'parsed_amount' },
      parsedMerchant: { type: DataTypes.STRING(255), allowNull: true, field: 'parsed_merchant' },
      parsedDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'parsed_date' },
      confidence: { type: DataTypes.FLOAT, defaultValue: 0 },
      status: { type: DataTypes.ENUM('pending', 'confirmed', 'rejected'), defaultValue: 'pending' },
      transactionId: { type: DataTypes.UUID, allowNull: true, field: 'transaction_id' },
    },
    { sequelize, tableName: 'parsed_transactions' }
  );
  return ParsedTransaction;
}
