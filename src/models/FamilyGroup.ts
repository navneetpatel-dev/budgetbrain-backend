import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface FamilyGroupAttributes {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FamilyGroupCreationAttributes = Optional<FamilyGroupAttributes, 'id'>;

export class FamilyGroup
  extends Model<FamilyGroupAttributes, FamilyGroupCreationAttributes>
  implements FamilyGroupAttributes
{
  declare id: string;
  declare ownerId: string;
  declare name: string;
  declare inviteCode: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initFamilyGroupModel(sequelize: Sequelize): typeof FamilyGroup {
  FamilyGroup.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'owner_id',
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      inviteCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
        field: 'invite_code',
      },
    },
    { sequelize, tableName: 'family_groups' }
  );
  return FamilyGroup;
}
