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
  createdAt?: Date;
  updatedAt?: Date;
}

export type GoalCreationAttributes = Optional<
  GoalAttributes,
  'id' | 'currentAmount' | 'targetDate' | 'completedAt'
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
    },
    { sequelize, tableName: 'goals' }
  );
  return Goal;
}
