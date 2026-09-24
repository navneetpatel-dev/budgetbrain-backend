import type { CsvMapping, ParsedLine } from '../statementImport.types';
import { cleanText, parseStatementAmount, parseStatementDate, type DateOrder } from './values';

/**
 * CSV statements (plan T6.5): RFC 4180 records read chunk by chunk, so quoted fields may hold
 * delimiters, quotes and line breaks. The user maps columns once; the server suggests a mapping.
 */

const DELIMITERS = [',', ';', '\t', '|'];
const MAX_FIELD_CHARS = 16 * 1024;

export interface CsvRecord {
  /** 1-based record number. */
  record: number;
  fields: string[];
}

/** The delimiter that splits this line into the most fields, outside quotes. */
export function detectDelimiter(sampleLine: string): string {
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let quoted = false;
    for (const ch of sampleLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

export async function* readCsvRecords(input: AsyncIterable<string | Buffer>, delimiter: string): AsyncGenerator<CsvRecord> {
  const decoder = new TextDecoder('utf-8');
  let field = '';
  let fields: string[] = [];
  let quoted = false;
  let afterQuote = false;
  let pendingCr = false;
  let record = 0;
  let first = true;

  const endField = () => {
    fields.push(field);
    field = '';
    afterQuote = false;
  };

  for await (const raw of input) {
    let chunk = typeof raw === 'string' ? raw : decoder.decode(raw, { stream: true });
    if (first) chunk = chunk.replace(/^\uFEFF/, '');
    first = false;
    const out: CsvRecord[] = [];
    for (let i = 0; i < chunk.length; i += 1) {
      const ch = chunk[i]!;
      if (pendingCr) {
        pendingCr = false;
        if (ch === '\n') continue;
      }
      if (quoted) {
        if (ch === '"') {
          if (chunk[i + 1] === '"') {
            field += '"';
            i += 1;
          } else if (i + 1 === chunk.length) {
            // A quote at a chunk boundary: decide when the next chunk arrives.
            quoted = false;
            afterQuote = true;
          } else {
            quoted = false;
            afterQuote = true;
          }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        if (afterQuote) {
          // `""` split across chunks, or a doubled quote right after a closing one.
          field += '"';
          quoted = true;
          afterQuote = false;
        } else if (field.trim() === '') {
          field = '';
          quoted = true;
        } else {
          field += ch;
        }
      } else if (ch === delimiter) {
        endField();
      } else if (ch === '\n' || ch === '\r') {
        endField();
        record += 1;
        if (!(fields.length === 1 && fields[0] === '')) out.push({ record, fields });
        fields = [];
        if (ch === '\r') {
          if (chunk[i + 1] === '\n') i += 1;
          else if (i + 1 === chunk.length) pendingCr = true;
        }
      } else {
        afterQuote = false;
        field += ch;
      }
      if (field.length > MAX_FIELD_CHARS) throw new Error(`A field is longer than ${MAX_FIELD_CHARS} characters`);
    }
    for (const r of out) yield r;
  }
  const tail = decoder.decode();
  if (tail) field += tail;
  if (field !== '' || fields.length > 0) {
    endField();
    record += 1;
    yield { record, fields };
  }
}

const HINTS: Record<keyof Omit<CsvMapping, 'headerRow' | 'dateOrder' | 'amountSign'>, RegExp> = {
  dateColumn: /(^|\b)(txn |transaction |posting |value |booking )?date\b|^datum$|^fecha$/i,
  descriptionColumn: /description|narration|particulars|details|merchant|payee|remarks|memo|beschreibung|name/i,
  amountColumn: /^\s*(transaction )?amount\b|^amt\b|^betrag$|^importe$/i,
  debitColumn: /debit|withdrawal|\bdr\b|paid out|money out|spent/i,
  creditColumn: /credit|deposit|\bcr\b|paid in|money in|received/i,
  referenceColumn: /ref|cheque|chq|transaction id|txn id|utr|fitid/i,
  currencyColumn: /^(currency|ccy|curr)$/i,
};

function pick(columns: string[], hint: RegExp, taken: Set<string>): string | undefined {
  const hit = columns.find((c) => !taken.has(c) && hint.test(c));
  if (hit) taken.add(hit);
  return hit;
}

/**
 * A mapping guessed from a header row, or null when there is no date, description and amount
 * (or debit/credit) column to go on. Balance columns are never picked as amounts.
 */
export function suggestMapping(header: string[], headerRow: number): CsvMapping | null {
  const columns = header.map((c) => c.trim()).filter(Boolean);
  const taken = new Set(columns.filter((c) => /balance|saldo|closing|opening/i.test(c)));
  const dateColumn = pick(columns, HINTS.dateColumn, taken);
  const amountColumn = pick(columns, HINTS.amountColumn, taken);
  const debitColumn = amountColumn ? undefined : pick(columns, HINTS.debitColumn, taken);
  const creditColumn = amountColumn ? undefined : pick(columns, HINTS.creditColumn, taken);
  const referenceColumn = pick(columns, HINTS.referenceColumn, taken);
  const currencyColumn = pick(columns, HINTS.currencyColumn, taken);
  const descriptionColumn = pick(columns, HINTS.descriptionColumn, taken);
  if (!dateColumn || !descriptionColumn || !(amountColumn || debitColumn || creditColumn)) return null;
  return {
    headerRow,
    dateColumn,
    descriptionColumn,
    ...(amountColumn ? { amountColumn } : {}),
    ...(debitColumn ? { debitColumn } : {}),
    ...(creditColumn ? { creditColumn } : {}),
    ...(referenceColumn ? { referenceColumn } : {}),
    ...(currencyColumn ? { currencyColumn } : {}),
    dateOrder: 'DMY',
    amountSign: 'debit_negative',
  };
}

/** Day/month order from sample date values: a first part above 12 means DMY, a second MDY. */
export function guessDateOrder(samples: string[], fallback: DateOrder): DateOrder {
  for (const value of samples) {
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}$/.exec(value.trim());
    if (!m) continue;
    if (Number(m[1]) > 12) return 'DMY';
    if (Number(m[2]) > 12) return 'MDY';
  }
  return fallback;
}

/** Turns CSV records into statement lines with a mapping; everything before the header is skipped. */
export function csvRowMapper(mapping: CsvMapping) {
  let index: Record<string, number> | null = null;
  const col = (fields: string[], name: string | undefined) => (name && index && index[name] !== undefined ? (fields[index[name]!] ?? '') : '');

  return (rec: CsvRecord): ParsedLine | null => {
    if (rec.record < mapping.headerRow) return null;
    if (rec.record === mapping.headerRow) {
      index = {};
      rec.fields.forEach((name, i) => {
        const key = name.trim();
        if (key && index![key] === undefined) index![key] = i;
      });
      const missing = [mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn, mapping.debitColumn, mapping.creditColumn]
        .filter((c): c is string => !!c)
        .filter((c) => index![c] === undefined);
      if (missing.length > 0) throw new Error(`Column not found in the header: ${missing.join(', ')}`);
      return null;
    }
    const line = rec.record;
    const fail = (error: string): ParsedLine => ({ ok: false, error: { line, error } });
    if (rec.fields.every((f) => f.trim() === '')) return null;

    const date = parseStatementDate(col(rec.fields, mapping.dateColumn), mapping.dateOrder);
    if (!date) return fail('Date not recognised');
    const description = cleanText(col(rec.fields, mapping.descriptionColumn));

    let amount: string | null = null;
    let direction: 'DEBIT' | 'CREDIT' | null = null;
    if (mapping.amountColumn) {
      const parsed = parseStatementAmount(col(rec.fields, mapping.amountColumn));
      if (parsed) {
        amount = parsed.amount;
        const negative = parsed.negative ?? false;
        direction = negative === (mapping.amountSign === 'debit_negative') ? 'DEBIT' : 'CREDIT';
      }
    } else {
      const debit = parseStatementAmount(col(rec.fields, mapping.debitColumn));
      const credit = parseStatementAmount(col(rec.fields, mapping.creditColumn));
      if (debit && Number(debit.amount) !== 0) {
        amount = debit.amount;
        direction = debit.negative ? 'CREDIT' : 'DEBIT';
      } else if (credit && Number(credit.amount) !== 0) {
        amount = credit.amount;
        direction = credit.negative ? 'DEBIT' : 'CREDIT';
      }
    }
    if (!amount || !direction) return fail('Amount not recognised');
    if (Number(amount) === 0) return fail('Amount is zero');

    const currency = col(rec.fields, mapping.currencyColumn).trim().toUpperCase();
    const reference = cleanText(col(rec.fields, mapping.referenceColumn));
    return {
      ok: true,
      row: {
        line,
        date,
        amount,
        direction,
        currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
        description,
        reference: reference || null,
      },
    };
  };
}
