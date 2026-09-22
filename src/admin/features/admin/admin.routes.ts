import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate, requireAdmin } from '../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './admin.controller';
import {
  auditLogsQuerySchema,
  supportTicketsQuerySchema,
  updateSupportTicketSchema,
  updateUserSchema,
  usersQuerySchema,
} from './validator/admin.validation';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/dashboard', asyncHandler(controller.getDashboard));
router.get('/users', validateQuery(usersQuerySchema), asyncHandler(controller.listUsers));
router.get('/users/:id', validateParams(uuidParamSchema), asyncHandler(controller.getUser));
router.patch(
  '/users/:id',
  validateParams(uuidParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(controller.updateUser)
);
router.get('/audit-logs', validateQuery(auditLogsQuerySchema), asyncHandler(controller.listAuditLogs));
router.get(
  '/audit-logs/:id',
  validateParams(uuidParamSchema),
  asyncHandler(controller.getAuditLog)
);
router.get('/stats', asyncHandler(controller.getStats));
router.get('/ai-usage', validateQuery(paginationSchema), asyncHandler(controller.listAiUsage));
router.get(
  '/support-tickets',
  validateQuery(supportTicketsQuerySchema),
  asyncHandler(controller.listSupportTickets)
);
router.patch(
  '/support-tickets/:id',
  validateParams(uuidParamSchema),
  validateBody(updateSupportTicketSchema),
  asyncHandler(controller.updateSupportTicket)
);
router.get('/subscriptions', asyncHandler(controller.listSubscriptions));
router.get('/revenue', asyncHandler(controller.getRevenueAnalytics));
router.get('/feature-usage', asyncHandler(controller.getFeatureUsage));

export default router;

