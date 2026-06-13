import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type TokenType = 'otp' | 'password_reset' | 'email_verify';

export interface VerificationTokenAttributes {
  id: string;
  userId: string | null;
  email: string;
  token: string;
  type: TokenType;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type VerificationTokenCreationAttributes = Optional<
  VerificationTokenAttributes,
  'id' | 'userId' | 'usedAt'
>;

export class VerificationToken
  extends Model<VerificationTokenAttributes, VerificationTokenCreationAttributes>
  implements VerificationTokenAttributes
{
  declare id: string;
  declare userId: string | null;
  declare email: string;
  declare token: string;
  declare type: TokenType;
  declare expiresAt: Date;
  declare usedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initVerificationTokenModel(sequelize: Sequelize): typeof VerificationToken {
  VerificationToken.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: true, field: 'user_id' },
      email: { type: DataTypes.STRING(255), allowNull: false },
      token: { type: DataTypes.STRING(255), allowNull: false },
      type: {
        type: DataTypes.ENUM('otp', 'password_reset', 'email_verify'),
        allowNull: false,
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      usedAt: { type: DataTypes.DATE, allowNull: true, field: 'used_at' },
    },
    {
      sequelize,
      tableName: 'verification_tokens',
      indexes: [{ fields: ['email', 'type'] }, { fields: ['token'] }],
    }
  );
  return VerificationToken;
}
