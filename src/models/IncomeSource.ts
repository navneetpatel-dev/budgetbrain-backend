import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type IncomeType = 'salary' | 'freelancing' | 'investments' | 'rental' | 'other';

export interface IncomeSourceAttributes {
  id: string;
  userId: string;
  name: string;
  type: IncomeType;
  isRecurring: boolean;
  recurringRule: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type IncomeSourceCreationAttributes = Optional<
  IncomeSourceAttributes,
  'id' | 'isRecurring' | 'recurringRule'
>;

export class IncomeSource
  extends Model<IncomeSourceAttributes, IncomeSourceCreationAttributes>
  implements IncomeSourceAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: IncomeType;
  declare isRecurring: boolean;
  declare recurringRule: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initIncomeSourceModel(sequelize: Sequelize): typeof IncomeSource {
  IncomeSource.init(
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('salary', 'freelancing', 'investments', 'rental', 'other'),
        defaultValue: 'other',
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
    },
    { sequelize, tableName: 'income_sources' }
  );
  return IncomeSource;
}
