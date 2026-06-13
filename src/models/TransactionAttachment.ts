import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface TransactionAttachmentAttributes {
  id: string;
  transactionId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  s3Key: string;
  s3Url: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TransactionAttachmentCreationAttributes = Optional<
  TransactionAttachmentAttributes,
  'id'
>;

export class TransactionAttachment
  extends Model<TransactionAttachmentAttributes, TransactionAttachmentCreationAttributes>
  implements TransactionAttachmentAttributes
{
  declare id: string;
  declare transactionId: string;
  declare fileName: string;
  declare fileType: string;
  declare fileSize: number;
  declare s3Key: string;
  declare s3Url: string;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initTransactionAttachmentModel(sequelize: Sequelize): typeof TransactionAttachment {
  TransactionAttachment.init(
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
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'file_name',
      },
      fileType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'file_type',
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'file_size',
      },
      s3Key: {
        type: DataTypes.STRING(500),
        allowNull: false,
        field: 's3_key',
      },
      s3Url: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        field: 's3_url',
      },
    },
    { sequelize, tableName: 'transaction_attachments' }
  );
  return TransactionAttachment;
}
