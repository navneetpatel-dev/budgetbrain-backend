import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { processBatchSync } from './sync.service';

const router = Router();
router.use(authenticate);

router.post(
  '/batch',
  asyncHandler(async (req, res) => {
    const { items } = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            action: z.enum(['create', 'update', 'delete']),
            resource: z.string(),
            payload: z.record(z.unknown()),
            timestamp: z.string(),
          })
        ),
      })
      .parse(req.body);

    const result = await processBatchSync((req as AuthRequest).userId!, items);
    successResponse(res, result);
  })
);

export default router;
