import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface AiUsageQuotaAttributes {
  id: string;
  userId: string;
  periodMonth: string; // 'YYYY-MM-01' — first day of the calendar month this row tracks
  tokensUsed: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AiUsageQuotaCreationAttributes = Optional<
  AiUsageQuotaAttributes,
  'id' | 'tokensUsed'
>;

export class AiUsageQuota
  extends Model<AiUsageQuotaAttributes, AiUsageQuotaCreationAttributes>
  implements AiUsageQuotaAttributes
{
  declare id: string;
  declare userId: string;
  declare periodMonth: string;
  declare tokensUsed: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initAiUsageQuotaModel(sequelize: Sequelize): typeof AiUsageQuota {
  AiUsageQuota.init(
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
      periodMonth: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'period_month',
      },
      tokensUsed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'tokens_used',
      },
    },
    {
      sequelize,
      tableName: 'ai_usage_quotas',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'period_month'],
        },
      ],
    }
  );

  return AiUsageQuota;
}

export function associateAiUsageQuota(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  AiUsageQuota.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}
