import { Router } from 'express';
import { asyncHandler } from '@core/http/errors';
import { authenticate } from '@core/auth/authenticate';
import { validateBody, validateParams } from '@core/middleware/validate';
import { uuidParamSchema } from '../../shared/validation/index';
import * as controller from './ai.controller';
import { chatSchema } from '@shared/modules/ai/validator/ai.validation';

const router = Router();
router.use(authenticate);

router.get('/insights', asyncHandler(controller.getInsights));
router.get('/anomalies', asyncHandler(controller.getAnomalies));
router.get('/conversations', asyncHandler(controller.listConversations));
router.get(
  '/conversations/:id',
  validateParams(uuidParamSchema),
  asyncHandler(controller.getConversation)
);
router.post('/chat', validateBody(chatSchema), asyncHandler(controller.chat));
router.post('/chat/stream', validateBody(chatSchema), asyncHandler(controller.chatStream));

export default router;
