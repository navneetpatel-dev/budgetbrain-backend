import {
  DataTypes,
  Model,
  Optional,
  Sequelize,
} from 'sequelize';

export type UserRole = 'free' | 'premium' | 'lifetime' | 'admin';
export type AuthProvider = 'email' | 'google' | 'apple';

export interface UserAttributes {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  country: string | null;
  currency: string;
  role: UserRole;
  authProvider: AuthProvider;
  googleId: string | null;
  appleId: string | null;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  financialGoals: string[] | null;
  salaryRange: string | null;
  monthlySavingsTarget: number | null;
  avatarUrl: string | null;
  theme: string | null;
  accent: string | null;
  lastLoginAt: Date | null;
  isSuspended: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | 'id'
  | 'passwordHash'
  | 'name'
  | 'country'
  | 'currency'
  | 'role'
  | 'authProvider'
  | 'googleId'
  | 'appleId'
  | 'emailVerified'
  | 'onboardingCompleted'
  | 'financialGoals'
  | 'salaryRange'
  | 'monthlySavingsTarget'
  | 'avatarUrl'
  | 'lastLoginAt'
  | 'isSuspended'
>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare passwordHash: string | null;
  declare name: string | null;
  declare country: string | null;
  declare currency: string;
  declare role: UserRole;
  declare authProvider: AuthProvider;
  declare googleId: string | null;
  declare appleId: string | null;
  declare emailVerified: boolean;
  declare onboardingCompleted: boolean;
  declare financialGoals: string[] | null;
  declare salaryRange: string | null;
  declare monthlySavingsTarget: number | null;
  declare avatarUrl: string | null;
  declare theme: string | null;
  declare accent: string | null;
  declare lastLoginAt: Date | null;
  declare isSuspended: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: 'password_hash',
      },
      name: DataTypes.STRING(255),
      country: DataTypes.STRING(100),
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      role: {
        type: DataTypes.ENUM('free', 'premium', 'lifetime', 'admin'),
        defaultValue: 'free',
      },
      authProvider: {
        type: DataTypes.ENUM('email', 'google', 'apple'),
        defaultValue: 'email',
        field: 'auth_provider',
      },
      googleId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        field: 'google_id',
      },
      appleId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true,
        field: 'apple_id',
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'email_verified',
      },
      onboardingCompleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'onboarding_completed',
      },
      financialGoals: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
        field: 'financial_goals',
      },
      salaryRange: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'salary_range',
      },
      monthlySavingsTarget: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        field: 'monthly_savings_target',
      },
      avatarUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: 'avatar_url',
      },
      theme: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: 'system',
      },
      accent: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: 'indigo',
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'last_login_at',
      },
      isSuspended: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_suspended',
      },
    },
    {
      sequelize,
      tableName: 'users',
      indexes: [{ fields: ['email'] }],
    }
  );
  return User;
}

export function associateUser(): void {
  const { RefreshToken } = require('./RefreshToken') as typeof import('./RefreshToken');
  const { Device } = require('./Device') as typeof import('./Device');
  const { Subscription } = require('./Subscription') as typeof import('./Subscription');
  const { Transaction } = require('./Transaction') as typeof import('./Transaction');
  const { Category } = require('./Category') as typeof import('./Category');
  const { IncomeSource } = require('./IncomeSource') as typeof import('./IncomeSource');
  const { Budget } = require('./Budget') as typeof import('./Budget');
  const { Goal } = require('./Goal') as typeof import('./Goal');
  const { Notification } = require('./Notification') as typeof import('./Notification');
  const { FamilyGroup } = require('./FamilyGroup') as typeof import('./FamilyGroup');
  const { AiConversation } = require('./AiConversation') as typeof import('./AiConversation');
  const { AuditLog } = require('./AuditLog') as typeof import('./AuditLog');
  const { FinancialAccount } = require('./FinancialAccount') as typeof import('./FinancialAccount');
  const { Investment } = require('./Investment') as typeof import('./Investment');
  const { ParsedTransaction } = require('./ParsedTransaction') as typeof import('./ParsedTransaction');
  const { SupportTicket } = require('./SupportTicket') as typeof import('./SupportTicket');
  const { VerificationToken } = require('./VerificationToken') as typeof import('./VerificationToken');

  User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
  User.hasMany(Device, { foreignKey: 'userId', as: 'devices' });
  User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });
  User.hasMany(Transaction, { foreignKey: 'userId', as: 'transactions' });
  User.hasMany(Category, { foreignKey: 'userId', as: 'categories' });
  User.hasMany(IncomeSource, { foreignKey: 'userId', as: 'incomeSources' });
  User.hasMany(Budget, { foreignKey: 'userId', as: 'budgets' });
  User.hasMany(Goal, { foreignKey: 'userId', as: 'goals' });
  User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
  User.hasMany(FamilyGroup, { foreignKey: 'ownerId', as: 'ownedGroups' });
  User.hasMany(AiConversation, { foreignKey: 'userId', as: 'aiConversations' });
  User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
  User.hasMany(FinancialAccount, { foreignKey: 'userId', as: 'financialAccounts' });
  User.hasMany(Investment, { foreignKey: 'userId', as: 'investments' });
  User.hasMany(ParsedTransaction, { foreignKey: 'userId', as: 'parsedTransactions' });
  User.hasMany(SupportTicket, { foreignKey: 'userId', as: 'supportTickets' });
  User.hasMany(VerificationToken, { foreignKey: 'userId', as: 'verificationTokens' });
}
