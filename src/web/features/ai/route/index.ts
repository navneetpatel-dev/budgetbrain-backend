import { Router } from 'express';
import { asyncHandler } from '../../../../shared/utils/errors';
import { authenticate, requirePremium } from '../../../../shared/middleware/auth';
import { validateBody, validateParams } from '../../../../shared/middleware/validate';
import { uuidParamSchema } from '../../../../shared/validation';
import * as controller from '../controller/ai.controller';
import { chatSchema } from '../validator/ai.validation';

const router = Router();
router.use(authenticate, requirePremium);

router.get('/insights', asyncHandler(controller.getInsights));
router.get('/anomalies', asyncHandler(controller.getAnomalies));
router.get('/conversations', asyncHandler(controller.listConversations));
router.get(
  '/conversations/:id',
  validateParams(uuidParamSchema),
  asyncHandler(controller.getConversation)
);
router.post('/chat', validateBody(chatSchema), asyncHandler(controller.chat));

export default router;
