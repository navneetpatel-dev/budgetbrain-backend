import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import * as adminService from '../services/adminService';

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
    const { page, limit } = z
      .object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() })
      .parse(req.query);
    const data = await adminService.listUsers(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { page, limit } = z
      .object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() })
      .parse(req.query);
    const data = await adminService.listSubscriptions(page, limit);
    successResponse(res, data);
  })
);

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, limit } = z
      .object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() })
      .parse(req.query);
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

export default router;
