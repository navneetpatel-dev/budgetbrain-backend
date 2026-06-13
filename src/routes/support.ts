import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { SupportTicket } from '../models';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tickets = await SupportTicket.findAll({
      where: { userId: (req as AuthRequest).userId! },
      order: [['createdAt', 'DESC']],
    });
    successResponse(res, tickets);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        subject: z.string().min(3).max(255),
        message: z.string().min(10),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      })
      .parse(req.body);

    const ticket = await SupportTicket.create({
      userId: (req as AuthRequest).userId!,
      subject: data.subject,
      message: data.message,
      priority: data.priority ?? 'medium',
    });

    successResponse(res, ticket, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findOne({
      where: { id: req.params.id, userId: (req as AuthRequest).userId! },
    });
    if (!ticket) throw new AppError(404, 'Ticket not found');
    successResponse(res, ticket);
  })
);

export default router;
