import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type LoanType = 'loan' | 'credit_card' | 'emi' | 'other';

export interface LoanAttributes {
  id: string;
  userId: string;
  name: string;
  type: LoanType;
  principal: number;
  interestRate: number | null;
  emiAmount: number | null;
  remainingBalance: number;
  currency: string;
  startDate: Date;
  dueDayOfMonth: number | null;
  notes: string | null;
  closed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LoanCreationAttributes = Optional<
  LoanAttributes,
  'id' | 'interestRate' | 'emiAmount' | 'currency' | 'dueDayOfMonth' | 'notes' | 'closed'
>;

export class Loan extends Model<LoanAttributes, LoanCreationAttributes> implements LoanAttributes {
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: LoanType;
  declare principal: number;
  declare interestRate: number | null;
  declare emiAmount: number | null;
  declare remainingBalance: number;
  declare currency: string;
  declare startDate: Date;
  declare dueDayOfMonth: number | null;
  declare notes: string | null;
  declare closed: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initLoanModel(sequelize: Sequelize): typeof Loan {
  Loan.init(
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
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('loan', 'credit_card', 'emi', 'other'),
        defaultValue: 'loan',
      },
      principal: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      interestRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        field: 'interest_rate',
      },
      emiAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        field: 'emi_amount',
      },
      remainingBalance: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        field: 'remaining_balance',
      },
      currency: {
        type: DataTypes.STRING(3),
        defaultValue: 'INR',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        field: 'start_date',
      },
      dueDayOfMonth: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'due_day_of_month',
      },
      notes: DataTypes.TEXT,
      closed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
    },
    { sequelize, tableName: 'loans' }
  );
  return Loan;
}

export function associateLoan(): void {
  const { User } = require('./User') as typeof import('./User');
  const { LoanPayment } = require('./LoanPayment') as typeof import('./LoanPayment');

  Loan.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Loan.hasMany(LoanPayment, { foreignKey: 'loanId', as: 'payments' });
}
