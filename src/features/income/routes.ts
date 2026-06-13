import { Router } from 'express';
import { asyncHandler, successResponse } from '../../utils/errors';
import { authenticate, AuthRequest } from '../../middleware/auth';
import * as incomeService from './income.service';
import {
  listIncomeSchema,
  createIncomeSchema,
  updateIncomeSchema,
  createSourceSchema,
} from './income.validation';
import { paginationSchema } from '../../shared/validation';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = listIncomeSchema.parse(req.query);
    const data = await incomeService.listIncome((req as AuthRequest).userId!, filters);
    successResponse(res, data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = createIncomeSchema.parse(req.body);
    const transaction = await incomeService.createIncome((req as AuthRequest).userId!, data);
    successResponse(res, transaction, 201);
  })
);

router.get(
  '/sources',
  asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const data = await incomeService.listSources((req as AuthRequest).userId!, { page, limit });
    successResponse(res, data);
  })
);

router.post(
  '/sources',
  asyncHandler(async (req, res) => {
    const data = createSourceSchema.parse(req.body);
    const source = await incomeService.createSource((req as AuthRequest).userId!, data);
    successResponse(res, source, 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const transaction = await incomeService.getIncome((req as AuthRequest).userId!, String(req.params.id));
    successResponse(res, transaction);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const data = updateIncomeSchema.parse(req.body);
    const transaction = await incomeService.updateIncome(
      (req as AuthRequest).userId!,
      String(req.params.id),
      data
    );
    successResponse(res, transaction);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await incomeService.deleteIncome((req as AuthRequest).userId!, String(req.params.id));
    successResponse(res, { message: 'Income deleted' });
  })
);

export default router;
