import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type AuditActorType = 'user' | 'admin' | 'system' | 'service';
export type AuditOutcome = 'success' | 'failure';
export type AuditSeverity = 'info' | 'warning' | 'critical';
export type AuditSource = 'mobile' | 'web' | 'admin' | 'system';

export interface AuditLogAttributes {
  id: string;
  userId: string | null;
  actorType: AuditActorType;
  action: string;
  resource: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  source: AuditSource;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt?: Date;
}

export type AuditLogCreationAttributes = Optional<
  AuditLogAttributes,
  | 'id'
  | 'userId'
  | 'actorType'
  | 'resourceId'
  | 'outcome'
  | 'severity'
  | 'source'
  | 'requestId'
  | 'ipAddress'
  | 'userAgent'
  | 'beforeState'
  | 'afterState'
  | 'metadata'
>;

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: string;
  declare userId: string | null;
  declare actorType: AuditActorType;
  declare action: string;
  declare resource: string;
  declare resourceId: string | null;
  declare outcome: AuditOutcome;
  declare severity: AuditSeverity;
  declare source: AuditSource;
  declare requestId: string | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare beforeState: Record<string, unknown> | null;
  declare afterState: Record<string, unknown> | null;
  declare metadata: Record<string, unknown> | null;
  declare readonly createdAt: Date;
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
      actorType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'user',
        field: 'actor_type',
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
      outcome: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'success',
      },
      severity: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'info',
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'system',
      },
      requestId: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'request_id',
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
      beforeState: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'before_state',
      },
      afterState: {
        type: DataTypes.JSONB,
        allowNull: true,
        field: 'after_state',
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'audit_logs',
      updatedAt: false,
      indexes: [
        { fields: ['created_at'] },
        { fields: ['user_id'] },
        { fields: ['action'] },
        { fields: ['resource'] },
        { fields: ['source'] },
        { fields: ['outcome'] },
        { fields: ['request_id'] },
      ],
    }
  );
  return AuditLog;
}

export function associateAuditLog(): void {
  const { User } = require('./User') as typeof import('./User');
  AuditLog.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user',
    onDelete: 'SET NULL',
  });
}
