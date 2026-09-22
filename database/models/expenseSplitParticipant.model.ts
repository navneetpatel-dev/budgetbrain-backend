import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface ExpenseSplitParticipantAttributes {
  id: string;
  transactionId: string;
  groupId: string;
  userId: string;
  shareAmount: number;
  settled: boolean;
  settledAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ExpenseSplitParticipantCreationAttributes = Optional<
  ExpenseSplitParticipantAttributes,
  'id' | 'settled' | 'settledAt'
>;

export class ExpenseSplitParticipant
  extends Model<ExpenseSplitParticipantAttributes, ExpenseSplitParticipantCreationAttributes>
  implements ExpenseSplitParticipantAttributes
{
  declare id: string;
  declare transactionId: string;
  declare groupId: string;
  declare userId: string;
  declare shareAmount: number;
  declare settled: boolean;
  declare settledAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initExpenseSplitParticipantModel(sequelize: Sequelize): typeof ExpenseSplitParticipant {
  ExpenseSplitParticipant.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      transactionId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'transaction_id',
      },
      groupId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'group_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      shareAmount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        field: 'share_amount',
      },
      settled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      settledAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'settled_at',
      },
    },
    {
      sequelize,
      tableName: 'expense_split_participants',
      indexes: [{ fields: ['transaction_id'] }, { fields: ['group_id'] }, { fields: ['user_id'] }],
    }
  );
  return ExpenseSplitParticipant;
}

export function associateExpenseSplitParticipant(): void {
  const { Transaction } = require('./transaction.model') as typeof import('./transaction.model');
  const { FamilyGroup } = require('./familyGroup.model') as typeof import('./familyGroup.model');
  const { User } = require('./user.model') as typeof import('./user.model');

  ExpenseSplitParticipant.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });
  ExpenseSplitParticipant.belongsTo(FamilyGroup, { foreignKey: 'groupId', as: 'group' });
  ExpenseSplitParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });
}
