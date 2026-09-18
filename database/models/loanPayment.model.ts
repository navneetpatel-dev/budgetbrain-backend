import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface LoanPaymentAttributes {
  id: string;
  loanId: string;
  userId: string;
  amount: number;
  notes: string | null;
  paidAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type LoanPaymentCreationAttributes = Optional<LoanPaymentAttributes, 'id' | 'notes'>;

export class LoanPayment
  extends Model<LoanPaymentAttributes, LoanPaymentCreationAttributes>
  implements LoanPaymentAttributes
{
  declare id: string;
  declare loanId: string;
  declare userId: string;
  declare amount: number;
  declare notes: string | null;
  declare paidAt: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initLoanPaymentModel(sequelize: Sequelize): typeof LoanPayment {
  LoanPayment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      loanId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'loan_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
      },
      notes: DataTypes.TEXT,
      paidAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        field: 'paid_at',
      },
    },
    { sequelize, tableName: 'loan_payments' }
  );
  return LoanPayment;
}

export function associateLoanPayment(): void {
  const { Loan } = require('./loan.model') as typeof import('./loan.model');
  LoanPayment.belongsTo(Loan, { foreignKey: 'loanId', as: 'loan' });
}
