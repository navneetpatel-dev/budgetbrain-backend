import { ParsedTransaction } from '../../models';
import { AppError } from '../../utils/errors';
import { parseSmsContent, parseEmailReceipt } from './parse.service';
import * as transactionService from '../expenses/transaction.service';

export async function parseSms(userId: string, content: string) {
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

  return { parsed: record, suggestion: parsed };
}

export async function parseEmail(userId: string, subject: string, body: string) {
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

  return { parsed: record, suggestion: parsed };
}

export async function listPending(userId: string) {
  return ParsedTransaction.findAll({
    where: { userId, status: 'pending' },
    order: [['createdAt', 'DESC']],
  });
}

export async function confirmParsed(
  userId: string,
  parsedId: string,
  data: {
    categoryId: string;
    amount?: number;
    merchant?: string;
    date?: string;
  }
) {
  const parsed = await ParsedTransaction.findOne({
    where: { id: parsedId, userId, status: 'pending' },
  });
  if (!parsed) throw new AppError(404, 'Parsed transaction not found');

  const transaction = await transactionService.createTransaction(userId, {
    type: 'expense',
    amount: data.amount ?? Number(parsed.parsedAmount),
    categoryId: data.categoryId,
    merchant: data.merchant ?? parsed.parsedMerchant ?? undefined,
    date:
      data.date ??
      parsed.parsedDate?.toISOString().split('T')[0] ??
      new Date().toISOString().split('T')[0],
  });

  await parsed.update({ status: 'confirmed', transactionId: transaction?.id ?? null });
  return { transaction, parsed };
}

export async function rejectParsed(userId: string, parsedId: string) {
  const parsed = await ParsedTransaction.findOne({
    where: { id: parsedId, userId, status: 'pending' },
  });
  if (!parsed) throw new AppError(404, 'Parsed transaction not found');

  await parsed.update({ status: 'rejected' });
  return parsed;
}
