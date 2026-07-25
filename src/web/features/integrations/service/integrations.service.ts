import { ParsedTransaction, sequelize } from '../../../../shared/models';
import { AppError } from '../../../shared/utils/errors';
import { parseSmsContent, parseEmailReceipt } from './parse.service';
import * as transactionService from '../../expenses/service/transaction.service';
import { writeAuditLog, AuditAction, AuditResource } from '../../../shared/services/audit.service';
import { paginatedResult, resolvePagination } from '../../../shared/pagination';
import type { PaginationInput } from '../../../shared/types';
import type { ConfirmParsedInput } from '../types';

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

export async function listPending(userId: string, filters: PaginationInput = {}) {
  const { page, limit, offset } = resolvePagination(filters.page, filters.limit);
  const { rows, count } = await ParsedTransaction.findAndCountAll({
    where: { userId, status: 'pending' },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
  return paginatedResult('pending', rows, count, page, limit);
}

export async function confirmParsed(
  userId: string,
  parsedId: string,
  data: ConfirmParsedInput
) {
  return sequelize.transaction(async (t) => {
    const parsed = await ParsedTransaction.findOne({
      where: { id: parsedId, userId, status: 'pending' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!parsed) throw new AppError(404, 'Parsed transaction not found');

    const transaction = await transactionService.createTransaction(
      userId,
      {
        type: 'expense',
        amount: data.amount ?? Number(parsed.parsedAmount),
        categoryId: data.categoryId,
        merchant: data.merchant ?? parsed.parsedMerchant ?? undefined,
        date:
          data.date ??
          parsed.parsedDate?.toISOString().split('T')[0] ??
          new Date().toISOString().split('T')[0],
      },
      { transaction: t }
    );

    await parsed.update(
      { status: 'confirmed', transactionId: transaction?.id ?? null },
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.INTEGRATION_CONFIRM,
      resource: AuditResource.PARSED_TRANSACTION,
      resourceId: parsedId,
      actorUserId: userId,
      afterState: { transactionId: transaction?.id ?? null, status: 'confirmed' },
      transaction: t,
    });

    return { transaction, parsed };
  });
}

export async function rejectParsed(userId: string, parsedId: string) {
  const parsed = await ParsedTransaction.findOne({
    where: { id: parsedId, userId, status: 'pending' },
  });
  if (!parsed) throw new AppError(404, 'Parsed transaction not found');

  await parsed.update({ status: 'rejected' });

  await writeAuditLog({
    action: AuditAction.INTEGRATION_REJECT,
    resource: AuditResource.PARSED_TRANSACTION,
    resourceId: parsedId,
    actorUserId: userId,
    afterState: { status: 'rejected' },
  });

  return parsed;
}
