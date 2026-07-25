import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface GoalContributionAttributes {
  id: string;
  goalId: string;
  userId: string;
  amount: number;
  notes: string | null;
  contributedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GoalContributionCreationAttributes = Optional<
  GoalContributionAttributes,
  'id' | 'notes'
>;

export class GoalContribution
  extends Model<GoalContributionAttributes, GoalContributionCreationAttributes>
  implements GoalContributionAttributes
{
  declare id: string;
  declare goalId: string;
  declare userId: string;
  declare amount: number;
  declare notes: string | null;
  declare contributedAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initGoalContributionModel(sequelize: Sequelize): typeof GoalContribution {
  GoalContribution.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      goalId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'goal_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      notes: DataTypes.TEXT,
      contributedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'contributed_at',
      },
    },
    { sequelize, tableName: 'goal_contributions' }
  );
  return GoalContribution;
}
