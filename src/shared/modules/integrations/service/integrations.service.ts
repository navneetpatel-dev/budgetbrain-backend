import { ParsedTransaction, sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import { parseSmsContent, parseEmailReceipt } from './parse.service';
import * as transactionService from '@shared/modules/expenses/service/transaction.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit';
import { paginatedResult, resolvePagination } from '@shared/pagination';
import type { PaginationInput } from '@shared/types';
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

    const merchant = data.merchant ?? parsed.parsedMerchant ?? undefined;
    const transaction = await transactionService.createTransaction(
      userId,
      {
        type: 'expense',
        amount: data.amount ?? Number(parsed.parsedAmount),
        categoryId: data.categoryId,
        merchant,
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

/**
 * Bulk-imports a bank/card statement CSV into the same pending-review queue used by
 * SMS/email parsing, so the existing confirm/reject flow handles it with no UI changes.
 * Supports one common export shape: header row with `date`, `description` (or `merchant`),
 * and `amount` columns, in any order. Not a full RFC 4180 parser — quoted fields containing
 * commas aren't supported, which covers the vast majority of bank/card CSV exports.
 */
export async function importCsv(userId: string, fileBuffer: Buffer): Promise<{ imported: number }> {
  const text = fileBuffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new AppError(400, 'CSV file has no data rows');

  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const descIdx = header.findIndex((h) => h === 'description' || h === 'merchant');
  const amountIdx = header.indexOf('amount');
  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    throw new AppError(400, 'CSV must include date, description (or merchant), and amount columns');
  }

  const records: Array<{
    userId: string;
    source: 'csv';
    rawContent: string;
    parsedAmount: number;
    parsedMerchant: string;
    parsedDate: Date;
    confidence: number;
  }> = [];

  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const rawDate = cols[dateIdx]?.trim();
    const rawDesc = cols[descIdx]?.trim();
    const rawAmount = cols[amountIdx]?.trim().replace(/[^0-9.-]/g, '');
    const amount = rawAmount ? Number(rawAmount) : NaN;
    const date = rawDate ? new Date(rawDate) : null;

    if (!rawDesc || Number.isNaN(amount) || !date || Number.isNaN(date.getTime())) continue;

    records.push({
      userId,
      source: 'csv',
      rawContent: line,
      parsedAmount: Math.abs(amount),
      parsedMerchant: rawDesc,
      parsedDate: date,
      confidence: 1,
    });
  }

  if (records.length === 0) throw new AppError(400, 'Could not parse any rows from the CSV file');

  await ParsedTransaction.bulkCreate(records);

  await writeAuditLog({
    action: AuditAction.INTEGRATION_CSV_IMPORT,
    resource: AuditResource.PARSED_TRANSACTION,
    actorUserId: userId,
    afterState: { count: records.length },
  });

  return { imported: records.length };
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
