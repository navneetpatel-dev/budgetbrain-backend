import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface BudgetAlertAttributes {
  id: string;
  budgetId: string;
  userId: string;
  threshold: number;
  triggeredAt: Date;
  acknowledged: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BudgetAlertCreationAttributes = Optional<
  BudgetAlertAttributes,
  'id' | 'acknowledged'
>;

export class BudgetAlert
  extends Model<BudgetAlertAttributes, BudgetAlertCreationAttributes>
  implements BudgetAlertAttributes
{
  declare id: string;
  declare budgetId: string;
  declare userId: string;
  declare threshold: number;
  declare triggeredAt: Date;
  declare acknowledged: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initBudgetAlertModel(sequelize: Sequelize): typeof BudgetAlert {
  BudgetAlert.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      budgetId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'budget_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      threshold: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      triggeredAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'triggered_at',
      },
      acknowledged: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    { sequelize, tableName: 'budget_alerts' }
  );
  return BudgetAlert;
}
