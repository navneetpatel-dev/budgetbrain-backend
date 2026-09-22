import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams, validateQuery } from '@core/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../shared/validation/index';
import * as controller from './support.controller';
import { createTicketSchema } from '@shared/modules/support/support.validator';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listTickets));
router.post('/', validateBody(createTicketSchema), asyncHandler(controller.createTicket));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getTicket));

export default router;
