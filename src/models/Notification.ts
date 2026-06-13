import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type NotificationType =
  | 'budget_exceeded'
  | 'goal_achieved'
  | 'subscription_renewal'
  | 'daily_reminder'
  | 'recurring_expense'
  | 'general';

export interface NotificationAttributes {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  sentAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NotificationCreationAttributes = Optional<
  NotificationAttributes,
  'id' | 'data' | 'read'
>;

export class Notification
  extends Model<NotificationAttributes, NotificationCreationAttributes>
  implements NotificationAttributes
{
  declare id: string;
  declare userId: string;
  declare type: NotificationType;
  declare title: string;
  declare body: string;
  declare data: Record<string, unknown> | null;
  declare read: boolean;
  declare sentAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initNotificationModel(sequelize: Sequelize): typeof Notification {
  Notification.init(
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
      type: {
        type: DataTypes.ENUM(
          'budget_exceeded',
          'goal_achieved',
          'subscription_renewal',
          'daily_reminder',
          'recurring_expense',
          'general'
        ),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      sentAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'sent_at',
      },
    },
    { sequelize, tableName: 'notifications' }
  );
  return Notification;
}
