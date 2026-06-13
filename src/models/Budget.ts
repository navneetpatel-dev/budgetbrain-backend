import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type BudgetType = 'monthly' | 'weekly' | 'category';

export interface BudgetAttributes {
  id: string;
  userId: string;
  name: string;
  type: BudgetType;
  amount: number;
  currency: string;
  categoryId: string | null;
  startDate: Date;
  endDate: Date | null;
  alertThreshold: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BudgetCreationAttributes = Optional<
  BudgetAttributes,
  'id' | 'categoryId' | 'endDate' | 'alertThreshold'
>;

export class Budget
  extends Model<BudgetAttributes, BudgetCreationAttributes>
  implements BudgetAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: BudgetType;
  declare amount: number;
  declare currency: string;
  declare categoryId: string | null;
  declare startDate: Date;
  declare endDate: Date | null;
  declare alertThreshold: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initBudgetModel(sequelize: Sequelize): typeof Budget {
  Budget.init(
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
        type: DataTypes.ENUM('monthly', 'weekly', 'category'),
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
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'start_date',
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'end_date',
      },
      alertThreshold: {
        type: DataTypes.INTEGER,
        defaultValue: 80,
        field: 'alert_threshold',
      },
    },
    { sequelize, tableName: 'budgets' }
  );
  return Budget;
}
