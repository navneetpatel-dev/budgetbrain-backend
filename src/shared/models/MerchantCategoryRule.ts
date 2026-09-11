import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface MerchantCategoryRuleAttributes {
  id: string;
  userId: string;
  merchant: string;
  categoryId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type MerchantCategoryRuleCreationAttributes = Optional<MerchantCategoryRuleAttributes, 'id'>;

export class MerchantCategoryRule
  extends Model<MerchantCategoryRuleAttributes, MerchantCategoryRuleCreationAttributes>
  implements MerchantCategoryRuleAttributes
{
  declare id: string;
  declare userId: string;
  declare merchant: string;
  declare categoryId: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initMerchantCategoryRuleModel(sequelize: Sequelize): typeof MerchantCategoryRule {
  MerchantCategoryRule.init(
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
      merchant: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'category_id',
      },
    },
    {
      sequelize,
      tableName: 'merchant_category_rules',
      indexes: [{ unique: true, fields: ['user_id', 'merchant'] }],
    }
  );
  return MerchantCategoryRule;
}

export function associateMerchantCategoryRule(): void {
  const { User } = require('./User') as typeof import('./User');
  const { Category } = require('./Category') as typeof import('./Category');

  MerchantCategoryRule.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  MerchantCategoryRule.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
}
