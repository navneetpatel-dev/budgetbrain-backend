import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as investmentService from './investment.service';
import { createInvestmentSchema, updateInvestmentSchema } from './investment.validation';
import { uuidParamSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const investments = await investmentService.listInvestments((req as AuthRequest).userId!);
    successResponse(res, investments);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createInvestmentSchema.parse(req.body);
    const investment = await investmentService.createInvestment((req as AuthRequest).userId!, data);
    successResponse(res, investment, 201);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = uuidParamSchema.parse(req.params);
    const data = updateInvestmentSchema.parse(req.body);
    const investment = await investmentService.updateInvestment(
      (req as AuthRequest).userId!,
      id,
      data
    );
    successResponse(res, investment);
  })
);

export default router;
