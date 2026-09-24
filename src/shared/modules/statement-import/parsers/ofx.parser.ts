import type { ParsedLine } from '../statementImport.types';
import { readBlocks, tagText } from './blocks';
import { cleanText, parseStatementAmount, parseStatementDate } from './values';

/**
 * OFX 1.x (SGML) and 2.x (XML), and Quicken's QFX, which is OFX (plan T6.5). Each
 * `<STMTTRN>` is one line; the statement currency comes from `<CURDEF>`.
 */
export async function* parseOfx(input: AsyncIterable<string | Buffer>): AsyncGenerator<ParsedLine> {
  let currency: string | null = null;
  let entry = 0;
  for await (const block of readBlocks(input, 'STMTTRN', (pre) => {
    currency = tagText(pre, 'CURDEF')?.toUpperCase() ?? null;
  })) {
    entry += 1;
    const fail = (error: string): ParsedLine => ({ ok: false, error: { line: entry, error } });
    const date = parseStatementDate(tagText(block, 'DTPOSTED') ?? tagText(block, 'DTUSER') ?? '', 'YMD');
    if (!date) {
      yield fail('Date not recognised');
      continue;
    }
    const amount = parseStatementAmount(tagText(block, 'TRNAMT') ?? '');
    if (!amount || Number(amount.amount) === 0) {
      yield fail('Amount not recognised');
      continue;
    }
    const name = tagText(block, 'NAME') ?? '';
    const memo = tagText(block, 'MEMO') ?? '';
    const description = cleanText(memo && !name.includes(memo) ? `${name} ${memo}` : name || memo);
    yield {
      ok: true,
      row: {
        line: entry,
        date,
        amount: amount.amount,
        direction: amount.negative ? 'DEBIT' : 'CREDIT',
        currency: tagText(block, 'CURSYM')?.toUpperCase() ?? currency,
        description,
        reference: tagText(block, 'FITID') ?? tagText(block, 'CHECKNUM'),
      },
    };
  }
}
