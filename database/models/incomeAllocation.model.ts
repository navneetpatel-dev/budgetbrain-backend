import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface IncomeAllocationAttributes {
  id: string;
  transactionId: string;
  financialAccountId: string;
  amount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IncomeAllocationCreationAttributes = Optional<IncomeAllocationAttributes, 'id'>;

export class IncomeAllocation
  extends Model<IncomeAllocationAttributes, IncomeAllocationCreationAttributes>
  implements IncomeAllocationAttributes
{
  declare id: string;
  declare transactionId: string;
  declare financialAccountId: string;
  declare amount: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initIncomeAllocationModel(sequelize: Sequelize): typeof IncomeAllocation {
  IncomeAllocation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      transactionId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'transaction_id',
      },
      financialAccountId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'financial_account_id',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
    },
    { sequelize, tableName: 'income_allocations' }
  );
  return IncomeAllocation;
}
