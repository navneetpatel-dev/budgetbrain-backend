import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as supportService from './support.service';
import { createTicketSchema } from './support.validation';
import { paginationSchema, uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await supportService.listUserTickets((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createTicketSchema.parse(req.body);
    const ticket = await supportService.createTicket((req as AuthRequest).userId!, data);
    successResponse(res, ticket, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const ticket = await supportService.getTicket((req as AuthRequest).userId!, id);
    successResponse(res, ticket);
  })
);

export default router;
