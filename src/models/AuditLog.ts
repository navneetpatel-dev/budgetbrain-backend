import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface AuditLogAttributes {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AuditLogCreationAttributes = Optional<
  AuditLogAttributes,
  'id' | 'userId' | 'resourceId' | 'ipAddress' | 'userAgent' | 'metadata'
>;

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: string;
  declare userId: string | null;
  declare action: string;
  declare resource: string;
  declare resourceId: string | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initAuditLogModel(sequelize: Sequelize): typeof AuditLog {
  AuditLog.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'user_id',
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      resource: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      resourceId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'resource_id',
      },
      ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: true,
        field: 'ip_address',
      },
      userAgent: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'user_agent',
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    { sequelize, tableName: 'audit_logs' }
  );
  return AuditLog;
}
