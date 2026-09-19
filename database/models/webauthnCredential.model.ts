import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface WebauthnCredentialAttributes {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  deviceLabel: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type WebauthnCredentialCreationAttributes = Optional<
  WebauthnCredentialAttributes,
  'id' | 'counter' | 'transports' | 'deviceLabel'
>;

export class WebauthnCredential
  extends Model<WebauthnCredentialAttributes, WebauthnCredentialCreationAttributes>
  implements WebauthnCredentialAttributes
{
  declare id: string;
  declare userId: string;
  declare credentialId: string;
  declare publicKey: string;
  declare counter: number;
  declare transports: string[] | null;
  declare deviceLabel: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initWebauthnCredentialModel(sequelize: Sequelize): typeof WebauthnCredential {
  WebauthnCredential.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      credentialId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
        field: 'credential_id',
      },
      publicKey: { type: DataTypes.TEXT, allowNull: false, field: 'public_key' },
      counter: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      transports: { type: DataTypes.JSONB, allowNull: true },
      deviceLabel: { type: DataTypes.STRING(255), allowNull: true, field: 'device_label' },
    },
    {
      sequelize,
      tableName: 'webauthn_credentials',
      indexes: [{ fields: ['user_id'] }],
    }
  );
  return WebauthnCredential;
}

export function associateWebauthnCredential(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  WebauthnCredential.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(WebauthnCredential, { foreignKey: 'userId', as: 'webauthnCredentials' });
}
