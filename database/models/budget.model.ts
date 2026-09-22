import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

/** Budget period — category scope is separate via optional `categoryId`. */
export type BudgetType = 'monthly' | 'weekly' | 'custom';

/**
 * 'single' — leftover/deficit from only the immediately preceding period (default).
 * 'compounding' — accumulates leftover/deficit across every period since `rolloverStartedAt`.
 */
export type BudgetRolloverMode = 'single' | 'compounding';

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
  rollover: boolean;
  rolloverMode: BudgetRolloverMode;
  rolloverStartedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BudgetCreationAttributes = Optional<
  BudgetAttributes,
  'id' | 'categoryId' | 'endDate' | 'alertThreshold' | 'rollover' | 'rolloverMode' | 'rolloverStartedAt'
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
  declare rollover: boolean;
  declare rolloverMode: BudgetRolloverMode;
  declare rolloverStartedAt: Date | null;
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
        type: DataTypes.ENUM('monthly', 'weekly', 'custom'),
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
        defaultValue: 50,
        field: 'alert_threshold',
      },
      rollover: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      rolloverMode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'single',
        field: 'rollover_mode',
      },
      rolloverStartedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'rollover_started_at',
      },
    },
    { sequelize, tableName: 'budgets', indexes: [{ fields: ['user_id'] }] }
  );
  return Budget;
}

export function associateBudget(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  const { Category } = require('./category.model') as typeof import('./category.model');
  const { BudgetAlert } = require('./budgetAlert.model') as typeof import('./budgetAlert.model');

  Budget.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Budget.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Budget.hasMany(BudgetAlert, { foreignKey: 'budgetId', as: 'alerts' });
}
