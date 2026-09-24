import type { ParsedLine, StatementRow } from '../statementImport.types';
import { readLines } from './lines';
import { cleanText } from './values';

/**
 * SWIFT MT940 (plan T6.5): `:61:` is the statement line, the `:86:` after it (possibly over
 * several lines) describes it, and `:60F:` carries the currency.
 */
const LINE_61 = /^(\d{2})(\d{2})(\d{2})(\d{4})?(RC|RD|C|D)([A-Z])?(\d[\d,]*)([A-Z][A-Z0-9]{3})([^/]*)(?:\/\/(.*))?/;

function describe86(text: string): string {
  // Structured :86: (e.g. German banks) uses ?NN sub-fields; keep the purpose and name parts.
  if (/\?\d{2}/.test(text)) {
    const parts = text.split(/\?(\d{2})/);
    const kept: string[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const code = Number(parts[i]);
      if ((code >= 20 && code <= 29) || code === 32 || code === 33 || (code >= 60 && code <= 63)) kept.push(parts[i + 1] ?? '');
    }
    return cleanText(kept.join(' '));
  }
  return cleanText(text);
}

export async function* parseMt940(input: AsyncIterable<string | Buffer>): AsyncGenerator<ParsedLine> {
  let currency: string | null = null;
  let pending: { row: Omit<StatementRow, 'description'>; info: string[] } | null = null;
  let current: 'info' | null = null;
  let lineNo = 0;

  const flush = (): ParsedLine | null => {
    if (!pending) return null;
    const { row, info } = pending;
    pending = null;
    return { ok: true, row: { ...row, description: describe86(info.join('')) } };
  };

  for await (const raw of readLines(input)) {
    lineNo += 1;
    const line = raw.trimEnd();
    const tag = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (!tag) {
      if (current === 'info' && pending && line !== '-' && !line.startsWith('-}')) pending.info.push(line);
      continue;
    }
    current = null;
    const [, code, value] = tag;
    if (code === '60F' || code === '60M') {
      const m = /^[CD]\d{6}([A-Z]{3})/.exec(value!);
      if (m) currency = m[1]!;
    } else if (code === '61') {
      const done = flush();
      if (done) yield done;
      const m = LINE_61.exec(value!);
      // MT940 amounts always use a comma as the decimal mark and never group digits.
      const amount = m ? /^(\d+)(?:,(\d*))?$/.exec(m[7]!) : null;
      const decimal = amount ? `${amount[1]!.replace(/^0+(?=\d)/, '')}${amount[2] ? `.${amount[2]}` : ''}` : null;
      if (!m || !decimal || Number(decimal) === 0) {
        yield { ok: false, error: { line: lineNo, error: 'Statement line not recognised' } };
        continue;
      }
      const [, yy, mm, dd, , mark] = m;
      const date = `${2000 + Number(yy)}-${mm}-${dd}`;
      if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
        yield { ok: false, error: { line: lineNo, error: 'Date not recognised' } };
        continue;
      }
      // RC reverses a credit (money goes out), RD reverses a debit (money comes back).
      const direction = mark === 'D' || mark === 'RC' ? 'DEBIT' : 'CREDIT';
      const customerRef = cleanText(m[9] ?? '');
      const bankRef = cleanText(m[10] ?? '');
      pending = {
        row: {
          line: lineNo,
          date,
          amount: decimal,
          direction,
          currency,
          reference: customerRef && customerRef !== 'NONREF' ? customerRef : bankRef || null,
        },
        info: [],
      };
    } else if (code === '86') {
      if (pending) {
        pending.info.push(value!);
        current = 'info';
      }
    } else {
      const done = flush();
      if (done) yield done;
    }
  }
  const last = flush();
  if (last) yield last;
}
