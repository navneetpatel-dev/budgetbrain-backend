import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as supportService from '../service/support.service';
import type { CreateTicketInput } from '../types';
import type { PaginationInput } from '../../../shared/types';

export async function listTickets(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await supportService.listUserTickets((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function createTicket(req: Request, res: Response) {
  const ticket = await supportService.createTicket(
    (req as AuthRequest).userId!,
    req.body as CreateTicketInput
  );
  successResponse(res, ticket, 201);
}

export async function getTicket(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const ticket = await supportService.getTicket((req as AuthRequest).userId!, id);
  successResponse(res, ticket);
}
