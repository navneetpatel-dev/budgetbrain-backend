import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, requireAdmin, AuthRequest } from '../../middleware/auth';
import * as adminService from './admin.service';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const data = await adminService.getAdminDashboard();
    successResponse(res, data);
  })
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await adminService.listUsers(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = await adminService.getUser(id);
    successResponse(res, data);
  })
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const body = z
      .object({
        role: z.enum(['free', 'premium', 'lifetime', 'admin']).optional(),
        suspended: z.boolean().optional(),
      })
      .parse(req.body);
    const data = await adminService.updateUser(id, body, (req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await adminService.listSubscriptions(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await adminService.listAuditLogs(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const data = await adminService.getTransactionStats();
    successResponse(res, data);
  })
);

router.get(
  '/revenue',
  asyncHandler(async (_req, res) => {
    const data = await adminService.getRevenue();
    successResponse(res, data);
  })
);

router.get(
  '/ai-usage',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await adminService.listAiUsage(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/support-tickets',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await adminService.listSupportTickets(page, limit);
    successResponse(res, data);
  })
);

router.patch(
  '/support-tickets/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const body = z
      .object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
        adminNotes: z.string().nullable().optional(),
      })
      .parse(req.body);
    const data = await adminService.updateSupportTicket(id, body, (req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

export default router;
