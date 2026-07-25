import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet';

export interface FinancialAccountAttributes {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institution: string | null;
  accountNumberLast4: string | null;
  balance: number;
  creditLimit: number | null;
  currency: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FinancialAccountCreationAttributes = Optional<
  FinancialAccountAttributes,
  'id' | 'institution' | 'accountNumberLast4' | 'creditLimit' | 'isActive'
>;

export class FinancialAccount
  extends Model<FinancialAccountAttributes, FinancialAccountCreationAttributes>
  implements FinancialAccountAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: AccountType;
  declare institution: string | null;
  declare accountNumberLast4: string | null;
  declare balance: number;
  declare creditLimit: number | null;
  declare currency: string;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initFinancialAccountModel(sequelize: Sequelize): typeof FinancialAccount {
  FinancialAccount.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      name: { type: DataTypes.STRING(255), allowNull: false },
      type: { type: DataTypes.ENUM('bank', 'credit_card', 'cash', 'wallet'), allowNull: false },
      institution: DataTypes.STRING(255),
      accountNumberLast4: { type: DataTypes.STRING(4), field: 'account_number_last4' },
      balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
      creditLimit: { type: DataTypes.DECIMAL(15, 2), allowNull: true, field: 'credit_limit' },
      currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    },
    { sequelize, tableName: 'financial_accounts' }
  );
  return FinancialAccount;
}
