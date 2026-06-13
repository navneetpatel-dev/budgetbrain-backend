import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse } from '../utils/errors';
import { authenticate, requirePremium, AuthRequest } from '../middleware/auth';
import * as aiService from '../services/aiService';

const router = Router();
router.use(authenticate);
router.use(requirePremium);

router.get(
  '/insights',
  asyncHandler(async (req, res) => {
    const data = await aiService.getSpendingInsights((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.get(
  '/anomalies',
  asyncHandler(async (req, res) => {
    const data = await aiService.detectAnomalies((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const data = await aiService.listConversations((req as AuthRequest).userId!);
    successResponse(res, data);
  })
);

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        message: z.string().min(1),
        conversationId: z.string().uuid().optional(),
      })
      .parse(req.body);

    const result = await aiService.chatWithCoach(
      (req as AuthRequest).userId!,
      data.message,
      data.conversationId
    );
    successResponse(res, result);
  })
);

export default router;
