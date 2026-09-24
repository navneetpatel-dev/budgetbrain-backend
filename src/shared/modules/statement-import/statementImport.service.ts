import { createReadStream, promises as fs } from 'fs';
import { QueryTypes } from 'sequelize';
import {
  categoryForTaxonomy,
  cleanMerchantName,
  parseDecimalToMinor,
  resolveMerchantName,
  type CompiledPack,
  type MessageSource,
} from '@budgetbrain/detection-core';
import { Category, FinancialAccount, User, sequelize } from '@database/models';
import { AppError, NotFoundError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { getServerPack } from '@modules/knowledge-base/serverPack.service';
import { syncBatch } from '@modules/transaction-detection/transactionDetection.service';
import { computeServerFingerprint } from '@modules/transaction-detection/engine/serverDeduplication.engine';
import { validateServerDetectedPayload } from '@modules/transaction-detection/engine/serverValidation.engine';
import { DETECTION_LIMITS } from '@modules/transaction-detection/transactionDetection.constants';
import type { DetectedItemInput } from '@modules/transaction-detection/transactionDetection.types';
import { csvRowMapper, detectDelimiter, guessDateOrder, readCsvRecords, suggestMapping } from './parsers/csv.parser';
import { parseOfx } from './parsers/ofx.parser';
import { parseQif } from './parsers/qif.parser';
import { parseMt940 } from './parsers/mt940.parser';
import { parseCamt053 } from './parsers/camt053.parser';
import type { DateOrder } from './parsers/values';
import { detectFormat } from './formatDetect';
import type {
  CsvLayout,
  CsvMapping,
  ImportOptions,
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
  ParsedLine,
  StatementFormat,
  StatementRow,
  StatementRowError,
} from './statementImport.types';

/**
 * Statement import (plan T6.5): CSV (with a column mapping), OFX/QFX, QIF, MT940 and CAMT.053.
 *
 * - The file is read as a stream, in batches of 100 rows, so memory stays flat however long the
 *   statement is. It is deleted by the caller as soon as the request ends; nothing of it is kept
 *   except the extracted fields of each row.
 * - Preview reads the whole file and reports what would happen, without writing anything.
 * - Import goes through the normal sync path. Each row gets a stable fingerprint, so importing
 *   the same (or an overlapping) statement again adds nothing twice.
 * - A row that looks like a transaction already in the ledger (same amount and type, within a
 *   day) waits for review instead of being added.
 */

export interface UploadedStatement {
  path: string;
  originalName: string;
}

const BATCH_SIZE = DETECTION_LIMITS.MAX_ITEMS_PER_BATCH;
const PREVIEW_ROWS = 50;
const MAX_ERRORS = 50;
const HEAD_BYTES = 16 * 1024;
const HEADER_SEARCH_RECORDS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const SOURCE: Record<StatementFormat, MessageSource> = {
  csv: 'csv',
  ofx: 'ofx',
  qif: 'qif',
  mt940: 'mt940',
  camt053: 'camt053',
};

const REFUND_WORDS = /\b(refund|reversal|reversed|cashback|chargeback|rev)\b/i;

async function readHead(path: string): Promise<string> {
  const handle = await fs.open(path, 'r');
  try {
    const buffer = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}

const stream = (path: string) => createReadStream(path, { highWaterMark: 64 * 1024 });

/** The CSV's delimiter, header row and suggested mapping, from its first records. */
async function csvLayout(path: string, head: string, defaultOrder: DateOrder): Promise<CsvLayout> {
  const firstLine = head.replace(/^\uFEFF/, '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const delimiter = detectDelimiter(firstLine);
  let header: string[] = [];
  let suggested: CsvMapping | null = null;
  const dateSamples: string[] = [];
  for await (const rec of readCsvRecords(stream(path), delimiter)) {
    if (!suggested) {
      if (rec.record > HEADER_SEARCH_RECORDS) break;
      const guess = suggestMapping(rec.fields, rec.record);
      if (guess) {
        suggested = guess;
        header = rec.fields.map((f) => f.trim());
      } else if (rec.record === 1) {
        header = rec.fields.map((f) => f.trim());
      }
      continue;
    }
    const at = header.indexOf(suggested.dateColumn);
    if (at >= 0 && rec.fields[at]) dateSamples.push(rec.fields[at]!);
    if (dateSamples.length >= 30) break;
  }
  if (suggested) suggested.dateOrder = guessDateOrder(dateSamples, defaultOrder);
  return { delimiter, columns: header.filter(Boolean), suggestedMapping: suggested };
}

async function* parseFile(
  path: string,
  format: StatementFormat,
  options: { mapping: CsvMapping | null; delimiter: string; dateOrder: DateOrder }
): AsyncGenerator<ParsedLine> {
  switch (format) {
    case 'ofx':
      yield* parseOfx(stream(path));
      return;
    case 'qif':
      yield* parseQif(stream(path), options.dateOrder);
      return;
    case 'mt940':
      yield* parseMt940(stream(path));
      return;
    case 'camt053':
      yield* parseCamt053(stream(path));
      return;
    case 'csv': {
      if (!options.mapping) throw new AppError(400, 'Choose which columns hold the date, description and amount', 'MAPPING_REQUIRED');
      const map = csvRowMapper(options.mapping);
      for await (const rec of readCsvRecords(stream(path), options.delimiter)) {
        let parsed: ParsedLine | null;
        try {
          parsed = map(rec);
        } catch (error) {
          throw new AppError(400, error instanceof Error ? error.message : 'Could not read the CSV header', 'MAPPING_INVALID');
        }
        if (parsed) yield parsed;
      }
    }
  }
}

async function* batches<T>(source: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  let batch: T[] = [];
  for await (const item of source) {
    batch.push(item);
    if (batch.length === size) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

interface ImportContext {
  userId: string;
  pack: CompiledPack;
  currency: string;
  source: MessageSource;
  account: { id: string; tail: string | null } | null;
  categories: { id: string; name: string }[];
  /** How often each (date, currency, amount, direction, reference) has been seen so far in this file. */
  occurrences: Map<string, number>;
  today: string;
}

async function importContext(userId: string, format: StatementFormat, options: ImportOptions): Promise<ImportContext> {
  const [user, account, categories, pack] = await Promise.all([
    User.findByPk(userId, { attributes: ['id', 'currency'] }),
    options.financialAccountId
      ? FinancialAccount.findOne({ where: { id: options.financialAccountId, userId }, attributes: ['id', 'accountNumberLast4'] })
      : null,
    Category.findAll({ where: { userId }, attributes: ['id', 'name'] }),
    getServerPack(),
  ]);
  if (!user) throw new NotFoundError('User not found');
  if (options.financialAccountId && !account) throw new NotFoundError('Financial account not found or does not belong to user');
  const tail = (account?.accountNumberLast4 ?? '').replace(/\D/g, '').slice(-4);
  return {
    userId,
    pack,
    currency: options.currency ?? user.currency ?? 'INR',
    source: SOURCE[format],
    account: account ? { id: account.id, tail: tail.length >= 3 ? tail : null } : null,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    occurrences: new Map(),
    today: new Date().toISOString().slice(0, 10),
  };
}

function typeOf(row: StatementRow): 'expense' | 'income' | 'refund' {
  if (row.direction === 'DEBIT') return 'expense';
  return REFUND_WORDS.test(row.description) ? 'refund' : 'income';
}

/**
 * A statement row as a sync item. Rows without a usable bank reference are told apart by their
 * position among same-day rows of the same amount (the n-th ₹120 payment of the day), encoded
 * in `receivedAt`, which feeds only the fingerprint. Re-importing the same statement, or one that
 * overlaps it, yields the same fingerprints.
 */
function toItem(ctx: ImportContext, row: StatementRow): { item: DetectedItemInput; error: string | null } {
  const currency = row.currency ?? ctx.currency;
  // Keyed on exactly what the fingerprint sees (not the description), so two different ₹120
  // payments on one day stay two rows.
  const key = `${row.date}|${currency}|${row.amount}|${row.direction}|${row.reference ?? ''}`;
  const occurrence = ctx.occurrences.get(key) ?? 0;
  ctx.occurrences.set(key, occurrence + 1);
  const receivedAt = new Date(Date.parse(`${row.date}T00:00:00Z`) + occurrence * 15 * 60 * 1000).toISOString();

  const merchant = row.description ? resolveMerchantName(row.description, ctx.pack, null) : null;
  const merchantName = (merchant?.name ?? (row.description ? cleanMerchantName(row.description) : '')).slice(0, 255) || null;
  const taxonomyCode = merchant?.merchantId ? (ctx.pack.merchants.get(merchant.merchantId)?.taxonomyCode ?? null) : null;
  const transactionType = typeOf(row);
  const categoryId = transactionType === 'expense' ? categoryForTaxonomy(taxonomyCode, ctx.categories, ctx.pack) : null;

  const item: DetectedItemInput = {
    clientId: `line${row.line}`,
    amount: row.amount,
    currency,
    direction: row.direction,
    transactionType,
    subtype: null,
    paymentMethod: null,
    institutionId: null,
    accountTail: ctx.account?.tail ?? null,
    referenceNumber: row.reference ? row.reference.slice(0, 100) : null,
    merchantName,
    merchantId: merchant?.merchantId ?? null,
    taxonomyCode,
    categoryId,
    categorySource: categoryId ? 'knowledge_base' : null,
    financialAccountId: ctx.account?.id ?? null,
    transactionDate: row.date,
    receivedAt,
    evidence: {
      templateMatched: false,
      institutionVerified: false,
      amountRoleUnique: true,
      directionUnambiguous: true,
      merchantKnown: !!merchant?.merchantId,
      dateExtracted: true,
      referencePresent: !!row.reference,
      merchantFuzzy: false,
    },
    confidenceTier: 'high',
    dedupFingerprint: '',
    source: ctx.source,
  };
  const validation = validateServerDetectedPayload(item, ctx.today, { maxAgeDays: DETECTION_LIMITS.MAX_IMPORT_AGE_DAYS });
  if (!validation.isValid || validation.amountMinor === undefined) return { item, error: validation.error ?? 'Invalid row' };
  item.dedupFingerprint = computeServerFingerprint(ctx.userId, item, validation.amountMinor);
  return { item, error: null };
}

/** Rows (by position) whose amount and type match a ledger transaction within a day. */
async function possibleDuplicates(userId: string, items: DetectedItemInput[]): Promise<Set<number>> {
  if (items.length === 0) return new Set();
  const days = items.map((i) => Date.parse(`${i.transactionDate}T00:00:00Z`));
  const from = new Date(Math.min(...days) - DAY_MS).toISOString().slice(0, 10);
  const to = new Date(Math.max(...days) + DAY_MS).toISOString().slice(0, 10);
  const amounts = [...new Set(items.map((i) => i.amount))];
  const rows = await sequelize.query<{ date: string; amount: string; type: string }>(
    `SELECT to_char("date", 'YYYY-MM-DD') AS date, "amount"::text AS amount, "type"::text AS type
     FROM "transactions"
     WHERE "user_id" = :userId AND "date" BETWEEN :from AND :to AND "amount" IN (:amounts)`,
    { type: QueryTypes.SELECT, replacements: { userId, from, to, amounts } }
  );
  const minor = (amount: string, currency: string) => {
    try {
      return parseDecimalToMinor(amount, currency);
    } catch {
      return Number.NaN;
    }
  };
  const found = new Set<number>();
  items.forEach((item, i) => {
    const day = Date.parse(`${item.transactionDate}T00:00:00Z`);
    const want = minor(item.amount, item.currency);
    const hit = rows.some(
      (r) =>
        r.type === item.transactionType &&
        minor(r.amount, item.currency) === want &&
        Math.abs(Date.parse(`${r.date}T00:00:00Z`) - day) <= DAY_MS
    );
    if (hit) found.add(i);
  });
  return found;
}

async function alreadyImported(userId: string, items: DetectedItemInput[]): Promise<Set<string>> {
  if (items.length === 0) return new Set();
  const rows = await sequelize.query<{ dedup_fingerprint: string }>(
    `SELECT dedup_fingerprint FROM detected_transactions WHERE user_id = :userId AND dedup_fingerprint IN (:fps)`,
    { type: QueryTypes.SELECT, replacements: { userId, fps: items.map((i) => i.dedupFingerprint) } }
  );
  return new Set(rows.map((r) => r.dedup_fingerprint));
}

interface Prepared {
  format: StatementFormat;
  csv: CsvLayout | null;
  mapping: CsvMapping | null;
  dateOrder: DateOrder;
}

async function prepare(file: UploadedStatement, options: ImportOptions): Promise<Prepared> {
  const head = await readHead(file.path);
  if (head.trim().length === 0) throw new AppError(400, 'The file is empty', 'IMPORT_EMPTY');
  if (head.includes('\u0000')) throw new AppError(400, 'This is not a text statement file', 'IMPORT_UNSUPPORTED');
  const format = options.format ?? detectFormat(head, file.originalName);
  const dateOrder: DateOrder = options.dateOrder ?? (format === 'qif' ? 'MDY' : 'DMY');
  if (format !== 'csv') return { format, csv: null, mapping: null, dateOrder };
  const csv = await csvLayout(file.path, head, dateOrder);
  return { format, csv, mapping: options.mapping ?? csv.suggestedMapping, dateOrder };
}

function pushError(errors: StatementRowError[], error: StatementRowError) {
  if (errors.length < MAX_ERRORS) errors.push(error);
}

/** What importing this file would do, without writing anything (plan T6.5 "preview before commit"). */
export async function previewStatement(userId: string, file: UploadedStatement, options: ImportOptions): Promise<ImportPreview> {
  const prep = await prepare(file, options);
  const empty: ImportPreview = {
    format: prep.format,
    csv: prep.csv,
    needsMapping: true,
    totalRows: 0,
    validRows: 0,
    possibleDuplicates: 0,
    alreadyImported: 0,
    errors: [],
    rows: [],
    dateRange: null,
  };
  if (prep.format === 'csv' && !prep.mapping) return empty;

  const ctx = await importContext(userId, prep.format, options);
  const preview: ImportPreview = { ...empty, needsMapping: false };
  let from: string | null = null;
  let to: string | null = null;
  const parsed = parseFile(file.path, prep.format, { mapping: prep.mapping, delimiter: prep.csv?.delimiter ?? ',', dateOrder: prep.dateOrder });
  for await (const batch of batches(parsed, BATCH_SIZE * 5)) {
    const valid: { row: StatementRow; item: DetectedItemInput }[] = [];
    for (const line of batch) {
      preview.totalRows += 1;
      if (preview.totalRows > DETECTION_LIMITS.MAX_IMPORT_ROWS) {
        throw new AppError(400, `A statement can have at most ${DETECTION_LIMITS.MAX_IMPORT_ROWS} rows`, 'IMPORT_TOO_LARGE');
      }
      if (!line.ok) {
        pushError(preview.errors, line.error);
        continue;
      }
      const { item, error } = toItem(ctx, line.row);
      if (error) {
        pushError(preview.errors, { line: line.row.line, error });
        continue;
      }
      valid.push({ row: line.row, item });
    }
    const items = valid.map((v) => v.item);
    const [dups, existing] = await Promise.all([possibleDuplicates(userId, items), alreadyImported(userId, items)]);
    valid.forEach(({ row, item }, i) => {
      preview.validRows += 1;
      const imported = existing.has(item.dedupFingerprint);
      const dup = dups.has(i) && !imported;
      if (imported) preview.alreadyImported += 1;
      if (dup) preview.possibleDuplicates += 1;
      if (!from || row.date < from) from = row.date;
      if (!to || row.date > to) to = row.date;
      if (preview.rows.length < PREVIEW_ROWS) {
        const previewRow: ImportPreviewRow = {
          line: row.line,
          date: row.date,
          amount: item.amount,
          currency: item.currency,
          direction: row.direction,
          transactionType: item.transactionType as ImportPreviewRow['transactionType'],
          merchant: item.merchantName,
          possibleDuplicate: dup,
        };
        preview.rows.push(previewRow);
      }
    });
  }
  preview.dateRange = from && to ? { from, to } : null;
  return preview;
}

/** Imports the file in batches through the sync path (plan T6.5). */
export async function importStatement(userId: string, file: UploadedStatement, options: ImportOptions): Promise<ImportResult> {
  const prep = await prepare(file, options);
  const ctx = await importContext(userId, prep.format, options);
  const result: ImportResult = { format: prep.format, totalRows: 0, created: 0, needsReview: 0, alreadyImported: 0, skippedDuplicates: 0, invalid: 0, errors: [] };

  const parsed = parseFile(file.path, prep.format, { mapping: prep.mapping, delimiter: prep.csv?.delimiter ?? ',', dateOrder: prep.dateOrder });
  for await (const batch of batches(parsed, BATCH_SIZE)) {
    const items: DetectedItemInput[] = [];
    for (const line of batch) {
      result.totalRows += 1;
      if (result.totalRows > DETECTION_LIMITS.MAX_IMPORT_ROWS) {
        throw new AppError(400, `A statement can have at most ${DETECTION_LIMITS.MAX_IMPORT_ROWS} rows`, 'IMPORT_TOO_LARGE');
      }
      if (!line.ok) {
        result.invalid += 1;
        pushError(result.errors, line.error);
        continue;
      }
      const { item, error } = toItem(ctx, line.row);
      if (error) {
        result.invalid += 1;
        pushError(result.errors, { line: line.row.line, error });
        continue;
      }
      items.push(item);
    }
    if (items.length === 0) continue;

    const dups = await possibleDuplicates(userId, items);
    let submit = items;
    let reviewIndexes = dups;
    if (!options.includePossibleDuplicates) {
      submit = items.filter((_item, i) => !dups.has(i));
      reviewIndexes = new Set();
      result.skippedDuplicates += items.length - submit.length;
    }
    if (submit.length === 0) continue;
    const sync = await syncBatch(userId, { items: submit }, { import: { reviewIndexes } });
    result.created += sync.createdCount;
    result.needsReview += sync.needsReviewCount;
    result.alreadyImported += sync.alreadySyncedCount;
    for (const r of sync.results) {
      if (r.status === 'validation_error') {
        result.invalid += 1;
        pushError(result.errors, { line: Number(r.clientId.slice(4)), error: r.error ?? 'Invalid row' });
      }
    }
  }
  if (result.totalRows === 0) throw new AppError(400, 'No transactions found in this file', 'IMPORT_EMPTY');

  // Counts only: never the file name or its content.
  await writeAuditLog({
    action: AuditAction.DETECTION_IMPORT,
    resource: AuditResource.DETECTED_TRANSACTION,
    resourceId: userId,
    actorUserId: userId,
    afterState: {
      format: result.format,
      rows: result.totalRows,
      created: result.created,
      needsReview: result.needsReview,
      alreadyImported: result.alreadyImported,
      skippedDuplicates: result.skippedDuplicates,
      invalid: result.invalid,
    },
  });
  return result;
}
