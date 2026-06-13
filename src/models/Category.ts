import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface CategoryAttributes {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CategoryCreationAttributes = Optional<
  CategoryAttributes,
  'id' | 'icon' | 'color' | 'isDefault' | 'isArchived' | 'sortOrder'
>;

export class Category
  extends Model<CategoryAttributes, CategoryCreationAttributes>
  implements CategoryAttributes
{
  declare id: string;
  declare userId: string;
  declare name: string;
  declare icon: string | null;
  declare color: string | null;
  declare isDefault: boolean;
  declare isArchived: boolean;
  declare sortOrder: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initCategoryModel(sequelize: Sequelize): typeof Category {
  Category.init(
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
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      icon: DataTypes.STRING(50),
      color: DataTypes.STRING(20),
      isDefault: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_default',
      },
      isArchived: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: 'is_archived',
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { sequelize, tableName: 'categories' }
  );
  return Category;
}

export const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: 'restaurant', color: '#FF6B6B' },
  { name: 'Rent', icon: 'home', color: '#4ECDC4' },
  { name: 'Utilities', icon: 'flash', color: '#45B7D1' },
  { name: 'Transportation', icon: 'car', color: '#96CEB4' },
  { name: 'Shopping', icon: 'cart', color: '#FFEAA7' },
  { name: 'Entertainment', icon: 'film', color: '#DDA0DD' },
  { name: 'Health', icon: 'medkit', color: '#98D8C8' },
  { name: 'Education', icon: 'school', color: '#F7DC6F' },
  { name: 'Investments', icon: 'trending-up', color: '#82E0AA' },
];
