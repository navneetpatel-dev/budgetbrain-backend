import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface ExchangeRateAttributes {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ExchangeRateCreationAttributes = Optional<
  ExchangeRateAttributes,
  'id' | 'createdAt' | 'updatedAt'
>;

export class ExchangeRate
  extends Model<ExchangeRateAttributes, ExchangeRateCreationAttributes>
  implements ExchangeRateAttributes
{
  declare id: string;
  declare fromCurrency: string;
  declare toCurrency: string;
  declare rate: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initExchangeRate(sequelize: Sequelize): typeof ExchangeRate {
  ExchangeRate.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      fromCurrency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        field: 'from_currency',
      },
      toCurrency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        field: 'to_currency',
      },
      rate: {
        type: DataTypes.DECIMAL(16, 6),
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: 'exchange_rates',
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ['from_currency', 'to_currency'],
        },
      ],
    }
  );

  return ExchangeRate;
}
