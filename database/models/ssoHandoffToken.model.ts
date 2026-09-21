import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface SsoHandoffTokenAttributes {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SsoHandoffTokenCreationAttributes = Optional<SsoHandoffTokenAttributes, 'id' | 'usedAt'>;

export class SsoHandoffToken
  extends Model<SsoHandoffTokenAttributes, SsoHandoffTokenCreationAttributes>
  implements SsoHandoffTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare tokenHash: string;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initSsoHandoffTokenModel(sequelize: Sequelize): typeof SsoHandoffToken {
  SsoHandoffToken.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
    },
    {
      sequelize,
      tableName: 'sso_handoff_tokens',
      indexes: [{ fields: ['user_id'] }],
    }
  );
  return SsoHandoffToken;
}
