import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate, requireAdmin } from '../../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/admin.controller';
import {
  updateSupportTicketSchema,
  updateUserSchema,
} from '../validator/admin.validation';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);

router.get('/dashboard', asyncHandler(controller.getDashboard));
router.get('/users', validateQuery(paginationSchema), asyncHandler(controller.listUsers));
router.get('/users/:id', validateParams(uuidParamSchema), asyncHandler(controller.getUser));
router.patch(
  '/users/:id',
  validateParams(uuidParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(controller.updateUser)
);
router.get(
  '/subscriptions',
  validateQuery(paginationSchema),
  asyncHandler(controller.listSubscriptions)
);
router.get('/audit-logs', validateQuery(paginationSchema), asyncHandler(controller.listAuditLogs));
router.get('/stats', asyncHandler(controller.getStats));
router.get('/revenue', asyncHandler(controller.getRevenue));
router.get('/ai-usage', validateQuery(paginationSchema), asyncHandler(controller.listAiUsage));
router.get(
  '/support-tickets',
  validateQuery(paginationSchema),
  asyncHandler(controller.listSupportTickets)
);
router.patch(
  '/support-tickets/:id',
  validateParams(uuidParamSchema),
  validateBody(updateSupportTicketSchema),
  asyncHandler(controller.updateSupportTicket)
);

export default router;
