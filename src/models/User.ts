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
