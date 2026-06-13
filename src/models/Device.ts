import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface DeviceAttributes {
  id: string;
  userId: string;
  deviceName: string;
  platform: string;
  pushToken: string | null;
  lastActiveAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DeviceCreationAttributes = Optional<
  DeviceAttributes,
  'id' | 'pushToken' | 'lastActiveAt'
>;

export class Device
  extends Model<DeviceAttributes, DeviceCreationAttributes>
  implements DeviceAttributes
{
  declare id: string;
  declare userId: string;
  declare deviceName: string;
  declare platform: string;
  declare pushToken: string | null;
  declare lastActiveAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initDeviceModel(sequelize: Sequelize): typeof Device {
  Device.init(
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
      deviceName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'device_name',
      },
      platform: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      pushToken: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'push_token',
      },
      lastActiveAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'last_active_at',
      },
    },
    { sequelize, tableName: 'devices' }
  );
  return Device;
}
