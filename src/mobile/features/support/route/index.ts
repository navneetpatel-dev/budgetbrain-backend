import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate } from '../../../../shared/middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../../../shared/middleware/validate';
import { paginationSchema, uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/support.controller';
import { createTicketSchema } from '../validator/support.validation';

const router = Router();
router.use(authenticate);

router.get('/', validateQuery(paginationSchema), asyncHandler(controller.listTickets));
router.post('/', validateBody(createTicketSchema), asyncHandler(controller.createTicket));
router.get('/:id', validateParams(uuidParamSchema), asyncHandler(controller.getTicket));

export default router;
