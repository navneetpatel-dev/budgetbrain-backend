import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as integrationsService from './integrations.service';
import {
  parseSmsSchema,
  parseEmailSchema,
  confirmParsedSchema,
} from './integrations.validation';
import { uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.post(
  '/sms',
  asyncHandler(async (req, res) => {
    const { content } = parseSmsSchema.parse(req.body);
    const result = await integrationsService.parseSms((req as AuthRequest).userId!, content);
    successResponse(res, result, 201);
  })
);

router.post(
  '/email',
  asyncHandler(async (req, res) => {
    const { subject, body } = parseEmailSchema.parse(req.body);
    const result = await integrationsService.parseEmail(
      (req as AuthRequest).userId!,
      subject,
      body
    );
    successResponse(res, result, 201);
  })
);

router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const pending = await integrationsService.listPending((req as AuthRequest).userId!);
    successResponse(res, pending);
  })
);

router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = confirmParsedSchema.parse(req.body);
    const result = await integrationsService.confirmParsed((req as AuthRequest).userId!, id, data);
    successResponse(res, result);
  })
);

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const parsed = await integrationsService.rejectParsed((req as AuthRequest).userId!, id);
    successResponse(res, parsed);
  })
);

export default router;
