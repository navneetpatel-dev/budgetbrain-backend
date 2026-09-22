import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type RecurringCadence = 'weekly' | 'monthly' | 'yearly';
export type RecurringSeriesSource = 'manual' | 'detected';

export interface RecurringSeriesAttributes {
  id: string;
  userId: string;
  merchant: string;
  categoryId: string | null;
  amount: number;
  currency: string;
  cadence: RecurringCadence;
  nextDueDate: Date;
  lastChargedDate: Date | null;
  active: boolean;
  reminderDaysBefore: number;
  source: RecurringSeriesSource;
  goalId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RecurringSeriesCreationAttributes = Optional<
  RecurringSeriesAttributes,
  | 'id'
  | 'categoryId'
  | 'currency'
  | 'lastChargedDate'
  | 'active'
  | 'reminderDaysBefore'
  | 'source'
  | 'goalId'
>;

export class RecurringSeries
  extends Model<RecurringSeriesAttributes, RecurringSeriesCreationAttributes>
  implements RecurringSeriesAttributes
{
  declare id: string;
  declare userId: string;
  declare merchant: string;
  declare categoryId: string | null;
  declare amount: number;
  declare currency: string;
  declare cadence: RecurringCadence;
  declare nextDueDate: Date;
  declare lastChargedDate: Date | null;
  declare active: boolean;
  declare reminderDaysBefore: number;
  declare source: RecurringSeriesSource;
  declare goalId: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initRecurringSeriesModel(sequelize: Sequelize): typeof RecurringSeries {
  RecurringSeries.init(
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
      merchant: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'category_id',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      cadence: {
        type: DataTypes.ENUM('weekly', 'monthly', 'yearly'),
        allowNull: false,
      },
      nextDueDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'next_due_date',
      },
      lastChargedDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'last_charged_date',
      },
      active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      reminderDaysBefore: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
        field: 'reminder_days_before',
      },
      source: {
        type: DataTypes.ENUM('manual', 'detected'),
        defaultValue: 'manual',
      },
      goalId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'goal_id',
      },
    },
    {
      sequelize,
      tableName: 'recurring_series',
      indexes: [
        { unique: true, name: 'recurring_series_user_merchant_unique', fields: ['user_id', 'merchant'] },
        { fields: ['user_id'] },
      ],
    }
  );
  return RecurringSeries;
}

export function associateRecurringSeries(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  const { Category } = require('./category.model') as typeof import('./category.model');
  const { Transaction } = require('./transaction.model') as typeof import('./transaction.model');
  const { Goal } = require('./goal.model') as typeof import('./goal.model');

  RecurringSeries.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  RecurringSeries.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  RecurringSeries.hasMany(Transaction, { foreignKey: 'recurringSeriesId', as: 'transactions' });
  RecurringSeries.belongsTo(Goal, { foreignKey: 'goalId', as: 'goal' });
}
