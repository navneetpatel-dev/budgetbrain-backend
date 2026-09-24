import type { ParsedLine } from '../statementImport.types';
import { readBlocks, tagAttr, tagBlock, tagText } from './blocks';
import { cleanText, parseStatementAmount, parseStatementDate } from './values';

/**
 * ISO 20022 CAMT.053 bank-to-customer statements (plan T6.5). Each `<Ntry>` is one line; for a
 * batch entry the entry total is imported, since that is what the account moved by.
 */
export async function* parseCamt053(input: AsyncIterable<string | Buffer>): AsyncGenerator<ParsedLine> {
  let entry = 0;
  for await (const block of readBlocks(input, 'Ntry', () => undefined)) {
    entry += 1;
    const fail = (error: string): ParsedLine => ({ ok: false, error: { line: entry, error } });
    const booking = tagBlock(block, 'BookgDt') ?? tagBlock(block, 'ValDt') ?? '';
    const date = parseStatementDate(tagText(booking, 'Dt') ?? tagText(booking, 'DtTm') ?? '', 'YMD');
    if (!date) {
      yield fail('Date not recognised');
      continue;
    }
    // The entry's own <Amt> comes before any transaction details.
    const amount = parseStatementAmount(tagText(block, 'Amt') ?? '');
    if (!amount || Number(amount.amount) === 0) {
      yield fail('Amount not recognised');
      continue;
    }
    let debit = (tagText(block, 'CdtDbtInd') ?? '').toUpperCase() === 'DBIT';
    if ((tagText(block, 'RvslInd') ?? '').toLowerCase() === 'true') debit = !debit;

    const parties = tagBlock(block, 'RltdPties') ?? '';
    const counterparty = tagBlock(parties, debit ? 'Cdtr' : 'Dbtr') ?? '';
    const name = tagText(counterparty, 'Nm');
    const remittance = tagText(tagBlock(block, 'RmtInf') ?? '', 'Ustrd');
    const description = cleanText(
      [name, remittance].filter(Boolean).join(' ') || tagText(block, 'AddtlNtryInf') || tagText(block, 'AddtlTxInf') || ''
    );
    yield {
      ok: true,
      row: {
        line: entry,
        date,
        amount: amount.amount,
        direction: debit ? 'DEBIT' : 'CREDIT',
        currency: tagAttr(block, 'Amt', 'Ccy')?.toUpperCase() ?? null,
        description,
        reference: tagText(block, 'AcctSvcrRef') ?? tagText(block, 'EndToEndId') ?? tagText(block, 'NtryRef'),
      },
    };
  }
}
