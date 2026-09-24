import { describe, it, expect } from 'vitest';
import { parseStatementAmount, parseStatementDate } from '../parsers/values';
import { readLines } from '../parsers/lines';
import { csvRowMapper, detectDelimiter, guessDateOrder, readCsvRecords, suggestMapping } from '../parsers/csv.parser';
import { parseOfx } from '../parsers/ofx.parser';
import { parseQif } from '../parsers/qif.parser';
import { parseMt940 } from '../parsers/mt940.parser';
import { parseCamt053 } from '../parsers/camt053.parser';
import { detectFormat } from '../formatDetect';
import type { ParsedLine } from '../statementImport.types';

/** Feeds text in fixed-size chunks, to exercise every chunk boundary. */
async function* chunks(text: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}

const rows = (lines: ParsedLine[]) => lines.filter((l) => l.ok).map((l) => (l as Extract<ParsedLine, { ok: true }>).row);

describe('amounts and dates', () => {
  it('reads the amount formats banks use', () => {
    expect(parseStatementAmount('-1,234.56')).toEqual({ amount: '1234.56', negative: true });
    expect(parseStatementAmount('(12.00)')).toEqual({ amount: '12.00', negative: true });
    expect(parseStatementAmount('1.234,56')).toEqual({ amount: '1234.56', negative: null });
    expect(parseStatementAmount('1,23,456.00')).toEqual({ amount: '123456.00', negative: null });
    expect(parseStatementAmount('1,23,456')).toEqual({ amount: '123456', negative: null });
    expect(parseStatementAmount('12.00 DR')).toEqual({ amount: '12.00', negative: true });
    expect(parseStatementAmount('500.00 Cr')).toEqual({ amount: '500.00', negative: false });
    expect(parseStatementAmount('₹ 500')).toEqual({ amount: '500', negative: null });
    expect(parseStatementAmount("1'234.50")).toEqual({ amount: '1234.50', negative: null });
    expect(parseStatementAmount('12.50-')).toEqual({ amount: '12.50', negative: true });
    expect(parseStatementAmount('abc')).toBeNull();
    expect(parseStatementAmount('')).toBeNull();
  });

  it('reads the date formats banks use, and rejects impossible ones', () => {
    expect(parseStatementDate('2026-09-24')).toBe('2026-09-24');
    expect(parseStatementDate('24/09/2026')).toBe('2026-09-24');
    expect(parseStatementDate('09/24/2026', 'DMY')).toBe('2026-09-24');
    expect(parseStatementDate('03/04/2026', 'MDY')).toBe('2026-03-04');
    expect(parseStatementDate('03/04/2026', 'DMY')).toBe('2026-04-03');
    expect(parseStatementDate('24-Sep-2026')).toBe('2026-09-24');
    expect(parseStatementDate('24 Sept 26')).toBe('2026-09-24');
    expect(parseStatementDate('Sep 24, 2026')).toBe('2026-09-24');
    expect(parseStatementDate('20260924120000.000[+5:30]')).toBe('2026-09-24');
    expect(parseStatementDate('31/02/2026')).toBeNull();
    expect(parseStatementDate('yesterday')).toBeNull();
  });
});

describe('streaming readers', () => {
  it('splits lines correctly at every chunk boundary, including a split \\r\\n', async () => {
    const text = '﻿a,1\r\nb,2\nc,3\rd,4\r\n';
    for (let size = 1; size <= text.length; size += 1) {
      expect(await collect(readLines(chunks(text, size)))).toEqual(['a,1', 'b,2', 'c,3', 'd,4']);
    }
  });

  it('reads quoted CSV fields with delimiters, quotes and line breaks at every chunk boundary', async () => {
    const text = 'Date,Description,Amount\r\n2026-09-01,"Coffee, ""Blue"" Tokai",-250.00\r\n2026-09-02,"Two\nlines",100\r\n\r\n';
    for (let size = 1; size <= text.length; size += 1) {
      const recs = await collect(readCsvRecords(chunks(text, size), ','));
      expect(recs.map((r) => r.fields)).toEqual([
        ['Date', 'Description', 'Amount'],
        ['2026-09-01', 'Coffee, "Blue" Tokai', '-250.00'],
        ['2026-09-02', 'Two\nlines', '100'],
      ]);
    }
  });

  it('yields the first row before reading the rest of the file (flat memory, plan T6.5)', async () => {
    let pulled = 0;
    async function* bigFile(): AsyncGenerator<string> {
      yield 'Date,Description,Amount\n';
      for (let chunk = 0; chunk < 10_000; chunk += 1) {
        pulled += 1;
        yield `2026-09-01,Row ${chunk},-1.00\n`;
      }
    }
    const records = readCsvRecords(bigFile(), ',');
    await records.next();
    const second = await records.next();
    expect(second.value?.fields[1]).toBe('Row 0');
    expect(pulled).toBeLessThanOrEqual(2);
  });
});

describe('CSV mapping', () => {
  it('detects the delimiter and the header row, skipping bank preamble lines', () => {
    expect(detectDelimiter('Date;Narration;Withdrawal;Deposit;Balance')).toBe(';');
    expect(detectDelimiter('Date\tDetails\tAmount')).toBe('\t');
    expect(suggestMapping(['Account statement for XX1234', '', ''], 1)).toBeNull();
    expect(suggestMapping(['Txn Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'], 4)).toEqual({
      headerRow: 4,
      dateColumn: 'Txn Date',
      descriptionColumn: 'Narration',
      debitColumn: 'Withdrawal Amt',
      creditColumn: 'Deposit Amt',
      referenceColumn: 'Chq/Ref No',
      dateOrder: 'DMY',
      amountSign: 'debit_negative',
    });
  });

  it('guesses the day/month order from the dates', () => {
    expect(guessDateOrder(['03/04/2026', '13/04/2026'], 'MDY')).toBe('DMY');
    expect(guessDateOrder(['03/04/2026', '04/13/2026'], 'DMY')).toBe('MDY');
    expect(guessDateOrder(['03/04/2026'], 'MDY')).toBe('MDY');
  });

  it('maps debit and credit columns, signed amounts, and reports bad rows', async () => {
    const text = [
      'Statement of account',
      'Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
      '01/09/2026,UPI-SWIGGY-swiggy@icici,425612345678,250.00,,10000.00',
      '02/09/2026,NEFT SALARY ACME,N265123456789,,"50,000.00",60000.00',
      '31/02/2026,Bad date,,10.00,,1',
      '03/09/2026,No amount,,,,1',
    ].join('\n');
    const map = csvRowMapper(suggestMapping(['Txn Date', 'Narration', 'Chq/Ref No', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance'], 2)!);
    const lines: ParsedLine[] = [];
    for await (const rec of readCsvRecords(chunks(text, 7), ',')) {
      const line = map(rec);
      if (line) lines.push(line);
    }
    expect(rows(lines)).toEqual([
      { line: 3, date: '2026-09-01', amount: '250.00', direction: 'DEBIT', currency: null, description: 'UPI-SWIGGY-swiggy@icici', reference: '425612345678' },
      { line: 4, date: '2026-09-02', amount: '50000.00', direction: 'CREDIT', currency: null, description: 'NEFT SALARY ACME', reference: 'N265123456789' },
    ]);
    expect(lines.filter((l) => !l.ok)).toEqual([
      { ok: false, error: { line: 5, error: 'Date not recognised' } },
      { ok: false, error: { line: 6, error: 'Amount not recognised' } },
    ]);

    const signed = csvRowMapper({ headerRow: 1, dateColumn: 'Date', descriptionColumn: 'Payee', amountColumn: 'Amount', dateOrder: 'MDY', amountSign: 'credit_negative' });
    signed({ record: 1, fields: ['Date', 'Payee', 'Amount'] });
    expect(signed({ record: 2, fields: ['09/14/2026', 'Card payment', '-120.00'] })).toMatchObject({ ok: true, row: { direction: 'CREDIT', date: '2026-09-14' } });
    const missing = csvRowMapper({ headerRow: 1, dateColumn: 'Date', descriptionColumn: 'Payee', amountColumn: 'Amount', dateOrder: 'DMY', amountSign: 'debit_negative' });
    expect(() => missing({ record: 1, fields: ['Date', 'Payee'] })).toThrow('Amount');
  });
});

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260915120000.000[-5:EST]
<TRNAMT>-42.17
<FITID>2026091501
<NAME>STARBUCKS #1234
<MEMO>Card purchase
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260916
<TRNAMT>1500.00
<FITID>2026091602
<NAME>PAYROLL ACME &amp; CO
</STMTTRN>
</BANKTRANLIST>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="220"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR</CURDEF><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260910</DTPOSTED><TRNAMT>-9.99</TRNAMT><FITID>A1</FITID><NAME>Netflix</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const QIF = `!Type:Bank
D09/15/2026
T-42.17
PSTARBUCKS
MCoffee
N1001
^
D9/16'26
U1,500.00
PACME PAYROLL
^
`;

const MT940 = `:20:STMT2026091
:25:DE89370400440532013000
:28C:00001/001
:60F:C260914EUR1000,00
:61:2609150915D42,17NMSCNONREF//BANKREF001
:86:?00SEPA-LASTSCHRIFT?20Coffee subscription?21September?32BEANS GMBH
:61:260916C1500,NTRFPAY-2026-09//BANKREF002
:86:Salary September
 ACME GMBH
:62F:C260916EUR2457,83
-`;

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Ntry><Amt Ccy="EUR">42.17</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-09-15</Dt></BookgDt>
<AcctSvcrRef>REF-001</AcctSvcrRef><NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Beans GmbH</Nm></Cdtr></RltdPties>
<RmtInf><Ustrd>Coffee subscription</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<ns2:Ntry><ns2:Amt Ccy="EUR">10.00</ns2:Amt><ns2:CdtDbtInd>DBIT</ns2:CdtDbtInd><ns2:RvslInd>true</ns2:RvslInd>
<ns2:BookgDt><ns2:DtTm>2026-09-16T10:00:00</ns2:DtTm></ns2:BookgDt><ns2:AddtlNtryInf>Returned debit</ns2:AddtlNtryInf></ns2:Ntry>
</Stmt></BkToCstmrStmt></Document>`;

describe('file formats', () => {
  it('detects formats from content first, then the extension', () => {
    expect(detectFormat(OFX_SGML, 'x.csv')).toBe('ofx');
    expect(detectFormat(OFX_XML, 'statement')).toBe('ofx');
    expect(detectFormat(QIF, 'a.txt')).toBe('qif');
    expect(detectFormat(MT940, 'a.txt')).toBe('mt940');
    expect(detectFormat(CAMT, 'a.xml')).toBe('camt053');
    expect(detectFormat('Date,Amount', 'a.qfx')).toBe('ofx');
    expect(detectFormat('Date,Amount', 'a.csv')).toBe('csv');
  });

  it('reads OFX 1.x (SGML) and 2.x (XML) at every chunk size', async () => {
    for (const size of [1, 7, 64, 100_000]) {
      expect(rows(await collect(parseOfx(chunks(OFX_SGML, size))))).toEqual([
        { line: 1, date: '2026-09-15', amount: '42.17', direction: 'DEBIT', currency: 'USD', description: 'STARBUCKS #1234 Card purchase', reference: '2026091501' },
        { line: 2, date: '2026-09-16', amount: '1500.00', direction: 'CREDIT', currency: 'USD', description: 'PAYROLL ACME & CO', reference: '2026091602' },
      ]);
    }
    expect(rows(await collect(parseOfx(chunks(OFX_XML, 13))))).toEqual([
      { line: 1, date: '2026-09-10', amount: '9.99', direction: 'DEBIT', currency: 'EUR', description: 'Netflix', reference: 'A1' },
    ]);
  });

  it('reads QIF records', async () => {
    expect(rows(await collect(parseQif(chunks(QIF, 5))))).toEqual([
      { line: 2, date: '2026-09-15', amount: '42.17', direction: 'DEBIT', currency: null, description: 'STARBUCKS', reference: '1001' },
      { line: 8, date: '2026-09-16', amount: '1500.00', direction: 'CREDIT', currency: null, description: 'ACME PAYROLL', reference: null },
    ]);
  });

  it('reads MT940 lines with structured and multi-line :86: fields', async () => {
    expect(rows(await collect(parseMt940(chunks(MT940, 9))))).toEqual([
      { line: 5, date: '2026-09-15', amount: '42.17', direction: 'DEBIT', currency: 'EUR', description: 'Coffee subscription September BEANS GMBH', reference: 'BANKREF001' },
      { line: 7, date: '2026-09-16', amount: '1500', direction: 'CREDIT', currency: 'EUR', description: 'Salary September ACME GMBH', reference: 'PAY-2026-09' },
    ]);
  });

  it('reads CAMT.053 entries, with namespaces and reversals', async () => {
    expect(rows(await collect(parseCamt053(chunks(CAMT, 11))))).toEqual([
      { line: 1, date: '2026-09-15', amount: '42.17', direction: 'DEBIT', currency: 'EUR', description: 'Beans GmbH Coffee subscription', reference: 'REF-001' },
      { line: 2, date: '2026-09-16', amount: '10.00', direction: 'CREDIT', currency: 'EUR', description: 'Returned debit', reference: null },
    ]);
  });
});
