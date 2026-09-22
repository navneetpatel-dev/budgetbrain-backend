import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type GoalType = 'emergency_fund' | 'vacation' | 'car' | 'home' | 'investments' | 'other';

export interface GoalAttributes {
  id: string;
  userId: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate: Date | null;
  completedAt: Date | null;
  /**
   * Server-computed completion percentage (0-100, capped). Per mobile/web convention
   * (money/derived values stay server-side), clients must render this field rather than
   * dividing currentAmount/targetAmount themselves.
   */
  progressPercentage: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GoalCreationAttributes = Optional<
  GoalAttributes,
  'id' | 'currentAmount' | 'targetDate' | 'completedAt' | 'progressPercentage'
>;

export class Goal
  extends Model<GoalAttributes, GoalCreationAttributes>
  implements GoalAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: GoalType;
  declare targetAmount: number;
  declare currentAmount: number;
  declare currency: string;
  declare targetDate: Date | null;
  declare completedAt: Date | null;
  declare progressPercentage: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initGoalModel(sequelize: Sequelize): typeof Goal {
  Goal.init(
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
        type: DataTypes.ENUM('emergency_fund', 'vacation', 'car', 'home', 'investments', 'other'),
        defaultValue: 'other',
      },
      targetAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        field: 'target_amount',
      },
      currentAmount: {
        type: DataTypes.DECIMAL(15, 2),
        defaultValue: 0,
        field: 'current_amount',
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      targetDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        field: 'target_date',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'completed_at',
      },
      progressPercentage: {
        type: DataTypes.VIRTUAL,
        get(this: Goal): number {
          const target = Number(this.getDataValue('targetAmount'));
          const current = Number(this.getDataValue('currentAmount'));
          if (!Number.isFinite(target) || target <= 0) return 0;
          return Math.min(100, Math.round((current / target) * 100));
        },
      },
    },
    { sequelize, tableName: 'goals', indexes: [{ fields: ['user_id'] }] }
  );
  return Goal;
}

export function associateGoal(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  const { GoalContribution } = require('./goalContribution.model') as typeof import('./goalContribution.model');

  Goal.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Goal.hasMany(GoalContribution, { foreignKey: 'goalId', as: 'contributions' });
}
