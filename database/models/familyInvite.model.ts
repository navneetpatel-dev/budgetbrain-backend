import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type FamilyInviteRole = 'admin' | 'contributor' | 'read_only';

export interface FamilyInviteAttributes {
  id: string;
  groupId: string;
  invitedEmail: string;
  invitedByUserId: string;
  tokenHash: string;
  role: FamilyInviteRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FamilyInviteCreationAttributes = Optional<
  FamilyInviteAttributes,
  'id' | 'role' | 'acceptedAt'
>;

export class FamilyInvite
  extends Model<FamilyInviteAttributes, FamilyInviteCreationAttributes>
  implements FamilyInviteAttributes
{
  declare id: string;
  declare groupId: string;
  declare invitedEmail: string;
  declare invitedByUserId: string;
  declare tokenHash: string;
  declare role: FamilyInviteRole;
  declare expiresAt: Date;
  declare acceptedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initFamilyInviteModel(sequelize: Sequelize): typeof FamilyInvite {
  FamilyInvite.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      groupId: { type: DataTypes.UUID, allowNull: false, field: 'group_id' },
      invitedEmail: { type: DataTypes.STRING(255), allowNull: false, field: 'invited_email' },
      invitedByUserId: { type: DataTypes.UUID, allowNull: false, field: 'invited_by_user_id' },
      tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
      role: {
        type: DataTypes.ENUM('admin', 'contributor', 'read_only'),
        allowNull: false,
        defaultValue: 'contributor',
      },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      acceptedAt: { type: DataTypes.DATE, allowNull: true, field: 'accepted_at' },
    },
    {
      sequelize,
      tableName: 'family_invites',
      indexes: [{ fields: ['invited_email'] }, { fields: ['group_id'] }],
    }
  );
  return FamilyInvite;
}
