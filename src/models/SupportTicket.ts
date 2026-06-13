import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high';

export interface SupportTicketAttributes {
  id: string;
  userId: string;
  subject: string;
  message: string;
  status: TicketStatus;
  priority: TicketPriority;
  adminNotes: string | null;
  resolvedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SupportTicketCreationAttributes = Optional<
  SupportTicketAttributes,
  'id' | 'status' | 'priority' | 'adminNotes' | 'resolvedAt'
>;

export class SupportTicket
  extends Model<SupportTicketAttributes, SupportTicketCreationAttributes>
  implements SupportTicketAttributes
{
  declare id: string;
  declare userId: string;
  declare subject: string;
  declare message: string;
  declare status: TicketStatus;
  declare priority: TicketPriority;
  declare adminNotes: string | null;
  declare resolvedAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

export function initSupportTicketModel(sequelize: Sequelize): typeof SupportTicket {
  SupportTicket.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      status: {
        type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'),
        defaultValue: 'open',
      },
      priority: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        defaultValue: 'medium',
      },
      adminNotes: { type: DataTypes.TEXT, allowNull: true, field: 'admin_notes' },
      resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    },
    { sequelize, tableName: 'support_tickets' }
  );
  return SupportTicket;
}
