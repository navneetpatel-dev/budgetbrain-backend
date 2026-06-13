import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type SubscriptionPlan = 'monthly' | 'yearly' | 'lifetime';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'trial';

export interface SubscriptionAttributes {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  revenueCatId: string | null;
  expiresAt: Date | null;
  purchasedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SubscriptionCreationAttributes = Optional<
  SubscriptionAttributes,
  'id' | 'revenueCatId' | 'expiresAt'
>;

export class Subscription
  extends Model<SubscriptionAttributes, SubscriptionCreationAttributes>
  implements SubscriptionAttributes
{
  declare id: string;
  declare userId: string;
  declare plan: SubscriptionPlan;
  declare status: SubscriptionStatus;
  declare revenueCatId: string | null;
  declare expiresAt: Date | null;
  declare purchasedAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initSubscriptionModel(sequelize: Sequelize): typeof Subscription {
  Subscription.init(
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
      plan: {
        type: DataTypes.ENUM('monthly', 'yearly', 'lifetime'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('active', 'expired', 'cancelled', 'trial'),
        defaultValue: 'active',
      },
      revenueCatId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'revenue_cat_id',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
      },
      purchasedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'purchased_at',
      },
    },
    { sequelize, tableName: 'subscriptions' }
  );
  return Subscription;
}
