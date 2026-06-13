import { SupportTicket } from '../../models';
import { AppError } from '../../utils/errors';
import { paginatedResult, resolvePagination, type PaginationInput } from '../../shared/pagination';

export async function listUserTickets(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await SupportTicket.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('tickets', rows, count, page, limit);
}

export async function createTicket(
  userId: string,
  data: {
    subject: string;
    message: string;
    priority?: 'low' | 'medium' | 'high';
  }
) {
  return SupportTicket.create({
    userId,
    subject: data.subject,
    message: data.message,
    priority: data.priority ?? 'medium',
  });
}

export async function getTicket(userId: string, ticketId: string) {
  const ticket = await SupportTicket.findOne({ where: { id: ticketId, userId } });
  if (!ticket) throw new AppError(404, 'Ticket not found');
  return ticket;
}
