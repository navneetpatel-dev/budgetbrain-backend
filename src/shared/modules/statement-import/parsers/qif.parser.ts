import type { ParsedLine } from '../statementImport.types';
import { readLines } from './lines';
import { cleanText, parseStatementAmount, parseStatementDate, type DateOrder } from './values';

/**
 * Quicken Interchange Format (plan T6.5): one field per line (`D` date, `T`/`U` amount, `P`
 * payee, `M` memo, `N` number), records end with `^`. Dates are usually US order.
 */
export async function* parseQif(input: AsyncIterable<string | Buffer>, dateOrder: DateOrder = 'MDY'): AsyncGenerator<ParsedLine> {
  let fields: Record<string, string> = {};
  let startLine = 0;
  let lineNo = 0;

  const finish = (): ParsedLine | null => {
    const record = fields;
    fields = {};
    if (Object.keys(record).length === 0) return null;
    const fail = (error: string): ParsedLine => ({ ok: false, error: { line: startLine, error } });
    // QIF writes 2-digit years as `1/15'24`.
    const date = parseStatementDate((record.D ?? '').replace(/'\s*/, '/'), dateOrder);
    if (!date) return fail('Date not recognised');
    const amount = parseStatementAmount(record.T ?? record.U ?? '');
    if (!amount || Number(amount.amount) === 0) return fail('Amount not recognised');
    const payee = record.P ?? '';
    const memo = record.M ?? '';
    return {
      ok: true,
      row: {
        line: startLine,
        date,
        amount: amount.amount,
        direction: amount.negative ? 'DEBIT' : 'CREDIT',
        currency: null,
        description: cleanText(payee || memo),
        reference: record.N?.trim() || null,
      },
    };
  };

  for await (const line of readLines(input)) {
    lineNo += 1;
    if (!line.trim() || line.startsWith('!')) continue;
    if (line.startsWith('^')) {
      const done = finish();
      if (done) yield done;
      continue;
    }
    if (Object.keys(fields).length === 0) startLine = lineNo;
    const code = line[0]!;
    // Split lines (S/E/$) belong to one transaction; only the first value of each code counts.
    if (fields[code] === undefined) fields[code] = line.slice(1);
  }
  const last = finish();
  if (last) yield last;
}
