import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type SubscriptionStatus =
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'in_grace_period'
  | 'in_billing_retry';

export type SubscriptionPlan = 'monthly' | 'yearly' | 'lifetime';
export type SubscriptionStore = 'app_store' | 'play_store' | 'stripe' | 'razorpay' | 'promotional';

export interface SubscriptionAttributes {
  id: string;
  userId: string;
  revenuecatAppUserId: string | null;
  productId: string;
  entitlementId: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  store: SubscriptionStore;
  isLifetime: boolean;
  originalPurchaseDate: Date | null;
  unsubscribeDetectedAt: Date | null;
  billingIssuesDetectedAt: Date | null;
  razorpayOrderId: string | null;
  razorpaySubscriptionId: string | null;
  razorpayPaymentId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SubscriptionCreationAttributes = Optional<
  SubscriptionAttributes,
  | 'id'
  | 'revenuecatAppUserId'
  | 'entitlementId'
  | 'status'
  | 'currentPeriodStart'
  | 'currentPeriodEnd'
  | 'store'
  | 'isLifetime'
  | 'originalPurchaseDate'
  | 'unsubscribeDetectedAt'
  | 'billingIssuesDetectedAt'
  | 'razorpayOrderId'
  | 'razorpaySubscriptionId'
  | 'razorpayPaymentId'
  | 'stripeCustomerId'
  | 'stripeSubscriptionId'
>;

export class Subscription
  extends Model<SubscriptionAttributes, SubscriptionCreationAttributes>
  implements SubscriptionAttributes
{
  declare id: string;
  declare userId: string;
  declare revenuecatAppUserId: string | null;
  declare productId: string;
  declare entitlementId: string;
  declare status: SubscriptionStatus;
  declare plan: SubscriptionPlan;
  declare currentPeriodStart: Date | null;
  declare currentPeriodEnd: Date | null;
  declare store: SubscriptionStore;
  declare isLifetime: boolean;
  declare originalPurchaseDate: Date | null;
  declare unsubscribeDetectedAt: Date | null;
  declare billingIssuesDetectedAt: Date | null;
  declare razorpayOrderId: string | null;
  declare razorpaySubscriptionId: string | null;
  declare razorpayPaymentId: string | null;
  declare stripeCustomerId: string | null;
  declare stripeSubscriptionId: string | null;
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
      revenuecatAppUserId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'revenuecat_app_user_id',
      },
      productId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'product_id',
      },
      entitlementId: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'pro',
        field: 'entitlement_id',
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'active',
      },
      plan: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      currentPeriodStart: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'current_period_start',
      },
      currentPeriodEnd: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'current_period_end',
      },
      store: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'app_store',
      },
      isLifetime: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_lifetime',
      },
      originalPurchaseDate: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'original_purchase_date',
      },
      unsubscribeDetectedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'unsubscribe_detected_at',
      },
      billingIssuesDetectedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'billing_issues_detected_at',
      },
      razorpayOrderId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'razorpay_order_id',
      },
      razorpaySubscriptionId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'razorpay_subscription_id',
      },
      razorpayPaymentId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'razorpay_payment_id',
      },
      stripeCustomerId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'stripe_customer_id',
      },
      stripeSubscriptionId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'stripe_subscription_id',
      },
    },
    {
      sequelize,
      tableName: 'subscriptions',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'entitlement_id'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['revenuecat_app_user_id'],
        },
      ],
    }
  );

  return Subscription;
}

export function associateSubscription(): void {
  const { User } = require('./user.model') as typeof import('./user.model');
  Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
}
