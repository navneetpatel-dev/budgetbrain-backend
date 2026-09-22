import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '../../shared/types/index';
import * as adminService from './admin.service';
import * as subscriptionsService from '@shared/modules/subscriptions/index';
import type {
  UpdateSupportTicketInput,
  UpdateUserInput,
} from './admin.types';
import type { PaginationInput } from '../../shared/types/index';


export async function getDashboard(_req: Request, res: Response) {
  const data = await adminService.getAdminDashboard();
  successResponse(res, data);
}

export async function listUsers(req: Request, res: Response) {
  const data = await adminService.listUsers(req.query as adminService.ListUsersFilters);
  successResponse(res, data);
}

export async function getUser(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const data = await adminService.getUser(id);
  successResponse(res, data);
}

export async function updateUser(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const data = await adminService.updateUser(
    id,
    req.body as UpdateUserInput,
    (req as AuthRequest).userId!
  );
  successResponse(res, data);
}

export async function listAuditLogs(req: Request, res: Response) {
  const data = await adminService.listAuditLogs(req.query as adminService.AuditLogFilters);
  successResponse(res, data);
}

export async function getAuditLog(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const data = await adminService.getAuditLog(id);
  successResponse(res, data);
}

export async function getStats(_req: Request, res: Response) {
  const data = await adminService.getTransactionStats();
  successResponse(res, data);
}

export async function listAiUsage(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await adminService.listAiUsage(page, limit);
  successResponse(res, data);
}

export async function listSupportTickets(req: Request, res: Response) {
  const { page, limit, status, sortBy, sortDir } = req.query as PaginationInput & {
    status?: string;
    sortBy?: string;
    sortDir?: string;
  };
  const data = await adminService.listSupportTickets(page, limit, status, sortBy, sortDir);
  successResponse(res, data);
}

export async function updateSupportTicket(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const data = await adminService.updateSupportTicket(
    id,
    req.body as UpdateSupportTicketInput,
    (req as AuthRequest).userId!
  );
  successResponse(res, data);
}

export async function listSubscriptions(req: Request, res: Response) {
  const { page, limit, status, plan, search } = req.query as any;
  const data = await subscriptionsService.listForAdmin({
    page: page ? Number(page) : undefined,
    limit: limit ? Number(limit) : undefined,
    status,
    plan,
    search,
  });
  successResponse(res, data);
}

export async function getRevenueAnalytics(_req: Request, res: Response) {
  const data = await subscriptionsService.getRevenueAnalytics();
  successResponse(res, data);
}

export async function getFeatureUsage(_req: Request, res: Response) {
  const data = await adminService.getFeatureUsageStats();
  successResponse(res, data);
}

