import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface RefreshTokenAttributes {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RefreshTokenCreationAttributes = Optional<
  RefreshTokenAttributes,
  'id' | 'deviceId' | 'revokedAt'
>;

export class RefreshToken
  extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes>
  implements RefreshTokenAttributes
{
  declare id: string;
  declare userId: string;
  declare tokenHash: string;
  declare deviceId: string | null;
  declare expiresAt: Date;
  declare revokedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initRefreshTokenModel(sequelize: Sequelize): typeof RefreshToken {
  RefreshToken.init(
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
      tokenHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'token_hash',
      },
      deviceId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'device_id',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'expires_at',
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'revoked_at',
      },
    },
    { sequelize, tableName: 'refresh_tokens' }
  );
  return RefreshToken;
}
