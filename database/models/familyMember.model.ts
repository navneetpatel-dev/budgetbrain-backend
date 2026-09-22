import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type FamilyRole = 'owner' | 'admin' | 'contributor' | 'read_only';

export interface FamilyMemberAttributes {
  id: string;
  groupId: string;
  userId: string;
  role: FamilyRole;
  joinedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FamilyMemberCreationAttributes = Optional<
  FamilyMemberAttributes,
  'id' | 'joinedAt'
>;

export class FamilyMember
  extends Model<FamilyMemberAttributes, FamilyMemberCreationAttributes>
  implements FamilyMemberAttributes
{
  declare id: string;
  declare groupId: string;
  declare userId: string;
  declare role: FamilyRole;
  declare joinedAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initFamilyMemberModel(sequelize: Sequelize): typeof FamilyMember {
  FamilyMember.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      groupId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'group_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      role: {
        type: DataTypes.ENUM('owner', 'admin', 'contributor', 'read_only'),
        defaultValue: 'contributor',
      },
      joinedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'joined_at',
      },
    },
    {
      sequelize,
      tableName: 'family_members',
      indexes: [{ fields: ['group_id'] }, { fields: ['user_id'] }],
    }
  );
  return FamilyMember;
}

export function associateFamilyMember(): void {
  const { FamilyGroup } = require('./familyGroup.model') as typeof import('./familyGroup.model');
  const { User } = require('./user.model') as typeof import('./user.model');

  FamilyMember.belongsTo(FamilyGroup, { foreignKey: 'groupId', as: 'group' });
  FamilyMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}
