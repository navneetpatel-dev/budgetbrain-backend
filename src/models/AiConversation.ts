import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface AiConversationAttributes {
  id: string;
  userId: string;
  title: string;
  messages: AiMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type AiConversationCreationAttributes = Optional<
  AiConversationAttributes,
  'id' | 'title'
>;

export class AiConversation
  extends Model<AiConversationAttributes, AiConversationCreationAttributes>
  implements AiConversationAttributes
{
  declare id: string;
  declare userId: string;
  declare title: string;
  declare messages: AiMessage[];
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initAiConversationModel(sequelize: Sequelize): typeof AiConversation {
  AiConversation.init(
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
      title: {
        type: DataTypes.STRING(255),
        defaultValue: 'New Conversation',
      },
      messages: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
    },
    { sequelize, tableName: 'ai_conversations' }
  );
  return AiConversation;
}
