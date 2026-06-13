import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type InvestmentType = 'stocks' | 'mutual_fund' | 'fd' | 'crypto' | 'gold' | 'other';

export interface InvestmentAttributes {
  id: string;
  userId: string;
  name: string;
  type: InvestmentType;
  symbol: string | null;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  currency: string;
  purchaseDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type InvestmentCreationAttributes = Optional<
  InvestmentAttributes,
  'id' | 'symbol' | 'currentPrice'
>;

export class Investment
  extends Model<InvestmentAttributes, InvestmentCreationAttributes>
  implements InvestmentAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare type: InvestmentType;
  declare symbol: string | null;
  declare quantity: number;
  declare purchasePrice: number;
  declare currentPrice: number;
  declare currency: string;
  declare purchaseDate: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initInvestmentModel(sequelize: Sequelize): typeof Investment {
  Investment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      name: { type: DataTypes.STRING(255), allowNull: false },
      type: {
        type: DataTypes.ENUM('stocks', 'mutual_fund', 'fd', 'crypto', 'gold', 'other'),
        defaultValue: 'other',
      },
      symbol: DataTypes.STRING(20),
      quantity: { type: DataTypes.DECIMAL(15, 4), defaultValue: 1 },
      purchasePrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false, field: 'purchase_price' },
      currentPrice: { type: DataTypes.DECIMAL(15, 2), allowNull: false, field: 'current_price' },
      currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
      purchaseDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'purchase_date' },
    },
    { sequelize, tableName: 'investments' }
  );
  return Investment;
}
