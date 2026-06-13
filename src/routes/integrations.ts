import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, successResponse, AppError } from '../utils/errors';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ParsedTransaction } from '../models';
import { parseSmsContent, parseEmailReceipt } from '../services/parseService';
import * as transactionService from '../services/transactionService';

const router = Router();
router.use(authenticate);

router.post(
  '/sms',
  asyncHandler(async (req, res) => {
    const { content } = z.object({ content: z.string().min(10) }).parse(req.body);
    const userId = (req as AuthRequest).userId!;
    const parsed = parseSmsContent(content);

    const record = await ParsedTransaction.create({
      userId,
      source: 'sms',
      rawContent: content,
      parsedAmount: parsed.amount,
      parsedMerchant: parsed.merchant,
      parsedDate: parsed.date,
      confidence: parsed.confidence,
    });

    successResponse(res, { parsed: record, suggestion: parsed }, 201);
  })
);

router.post(
  '/email',
  asyncHandler(async (req, res) => {
    const { subject, body } = z
      .object({ subject: z.string(), body: z.string().min(10) })
      .parse(req.body);
    const userId = (req as AuthRequest).userId!;
    const parsed = parseEmailReceipt(subject, body);

    const record = await ParsedTransaction.create({
      userId,
      source: 'email',
      rawContent: `${subject}\n${body}`,
      parsedAmount: parsed.amount,
      parsedMerchant: parsed.merchant,
      parsedDate: parsed.date,
      confidence: parsed.confidence,
    });

    successResponse(res, { parsed: record, suggestion: parsed }, 201);
  })
);

router.get(
  '/pending',
  asyncHandler(async (req, res) => {
    const pending = await ParsedTransaction.findAll({
      where: { userId: (req as AuthRequest).userId!, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });
    successResponse(res, pending);
  })
);

router.post(
  '/:id/confirm',
  asyncHandler(async (req, res) => {
    const userId = (req as AuthRequest).userId!;
    const data = z
      .object({
        categoryId: z.string().uuid(),
        amount: z.number().positive().optional(),
        merchant: z.string().optional(),
        date: z.string().optional(),
      })
      .parse(req.body);

    const parsed = await ParsedTransaction.findOne({
      where: { id: String(req.params.id), userId, status: 'pending' },
    });
    if (!parsed) throw new AppError(404, 'Parsed transaction not found');

    const transaction = await transactionService.createTransaction(userId, {
      type: 'expense',
      amount: data.amount ?? Number(parsed.parsedAmount),
      categoryId: data.categoryId,
      merchant: data.merchant ?? parsed.parsedMerchant ?? undefined,
      date: data.date ?? parsed.parsedDate?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0],
    });

    await parsed.update({ status: 'confirmed', transactionId: transaction?.id ?? null });
    successResponse(res, { transaction, parsed });
  })
);

router.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const parsed = await ParsedTransaction.findOne({
      where: { id: String(req.params.id), userId: (req as AuthRequest).userId!, status: 'pending' },
    });
    if (!parsed) throw new AppError(404, 'Parsed transaction not found');

    await parsed.update({ status: 'rejected' });
    successResponse(res, parsed);
  })
);

export default router;
