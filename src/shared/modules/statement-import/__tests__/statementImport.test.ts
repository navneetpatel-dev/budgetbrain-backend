import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { DetectedTransaction, FinancialAccount, Transaction } from '@database/models';
import { generateAccessToken } from '@core/auth/jwt';
import { redis } from '@core/cache/redis.client';
import { STATEMENT_UPLOAD_DIR } from '@core/middleware/upload';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import webApp from '../../../../web/app';

/** Statement import end to end through the web API (plan T6.5). */

let server: Server;
let base: string;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function signedInUser() {
  const user = await createTestUser();
  return { user, token: generateAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}

async function upload(token: string, path: string, name: string, body: string, options?: unknown) {
  const form = new FormData();
  form.append('file', new Blob([body], { type: 'text/plain' }), name);
  if (options !== undefined) form.append('options', JSON.stringify(options));
  const res = await fetch(`${base}/detected-transactions/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: (await res.json()) as any };
}

async function uploadDirIsEmpty(): Promise<boolean> {
  const files = await fs.readdir(STATEMENT_UPLOAD_DIR).catch(() => []);
  return files.length === 0;
}

const CSV = [
  'Statement for account XX9876',
  '',
  'Txn Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance',
  `${daysAgo(3).split('-').reverse().join('/')},UPI-SWIGGY-swiggy@icici,425612345678,250.00,,10000.00`,
  `${daysAgo(2).split('-').reverse().join('/')},COFFEE HOUSE,,120.00,,9880.00`,
  `${daysAgo(2).split('-').reverse().join('/')},COFFEE HOUSE,,120.00,,9760.00`,
  `${daysAgo(1).split('-').reverse().join('/')},NEFT SALARY ACME,N265123456789,,"50,000.00",59760.00`,
  `${daysAgo(1).split('-').reverse().join('/')},REFUND AMAZON,,,99.00,59859.00`,
  '31/02/2026,Bad date,,10.00,,1',
].join('\r\n');

describe('statement import (T6.5)', () => {
  beforeAll(async () => {
    await setupTestDb();
    server = await new Promise<Server>((resolve) => {
      const s = webApp.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  beforeEach(async () => {
    const limited = await redis.keys('rl:ingest:*');
    if (limited.length > 0) await redis.del(...limited);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('previews a bank CSV with a guessed mapping, writing nothing', async () => {
    const { user, token } = await signedInUser();
    const res = await upload(token, 'import/preview', 'statement.csv', CSV);
    expect(res.status).toBe(200);
    const preview = res.body.data;
    expect(preview).toMatchObject({
      format: 'csv',
      needsMapping: false,
      totalRows: 6,
      validRows: 5,
      possibleDuplicates: 0,
      alreadyImported: 0,
      errors: [{ line: 9, error: 'Date not recognised' }],
      dateRange: { from: daysAgo(3), to: daysAgo(1) },
    });
    expect(preview.csv.suggestedMapping).toMatchObject({ headerRow: 3, debitColumn: 'Withdrawal Amt', creditColumn: 'Deposit Amt' });
    expect(preview.rows.map((r: any) => [r.transactionType, r.amount])).toEqual([
      ['expense', '250.00'],
      ['expense', '120.00'],
      ['expense', '120.00'],
      ['income', '50000.00'],
      ['refund', '99.00'],
    ]);
    expect(await DetectedTransaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await uploadDirIsEmpty()).toBe(true);
  });

  it('imports once: identical rows are kept apart, a re-import adds nothing', async () => {
    const { user, token } = await signedInUser();
    const account = await FinancialAccount.create({ userId: user.id, name: 'Savings', type: 'bank', accountNumberLast4: '9876' } as any);
    const first = await upload(token, 'import', 'statement.csv', CSV, { financialAccountId: account.id });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ format: 'csv', totalRows: 6, created: 5, needsReview: 0, alreadyImported: 0, invalid: 1 });
    const detected = await DetectedTransaction.findAll({ where: { userId: user.id } });
    expect(detected.every((d) => d.source === 'csv' && d.financialAccountId === account.id && d.accountTail === '9876')).toBe(true);
    expect(await Transaction.count({ where: { userId: user.id } })).toBe(5);

    const again = await upload(token, 'import', 'statement.csv', CSV, { financialAccountId: account.id });
    expect(again.body.data).toMatchObject({ created: 0, alreadyImported: 5 });
    const preview = await upload(token, 'import/preview', 'statement.csv', CSV, { financialAccountId: account.id });
    expect(preview.body.data).toMatchObject({ alreadyImported: 5, possibleDuplicates: 0 });
    expect(await Transaction.count({ where: { userId: user.id } })).toBe(5);
    expect(await uploadDirIsEmpty()).toBe(true);
  });

  it('sends a row that matches a ledger transaction to review, or leaves it out', async () => {
    const { user, token } = await signedInUser();
    await createTestTransaction(user.id, { type: 'expense', amount: 250, date: daysAgo(3) } as any);
    const preview = await upload(token, 'import/preview', 'statement.csv', CSV);
    expect(preview.body.data.possibleDuplicates).toBe(1);
    expect(preview.body.data.rows[0]).toMatchObject({ amount: '250.00', possibleDuplicate: true });

    const res = await upload(token, 'import', 'statement.csv', CSV);
    expect(res.body.data).toMatchObject({ created: 4, needsReview: 1 });
    const review = await DetectedTransaction.findOne({ where: { userId: user.id, status: 'pending_review' } });
    expect(review?.reviewReason).toBe('possible_duplicate');

    const { user: other, token: otherToken } = await signedInUser();
    await createTestTransaction(other.id, { type: 'expense', amount: 250, date: daysAgo(3) } as any);
    const skipped = await upload(otherToken, 'import', 'statement.csv', CSV, { includePossibleDuplicates: false });
    expect(skipped.body.data).toMatchObject({ created: 4, needsReview: 0, skippedDuplicates: 1, invalid: 1 });
  });

  it('asks for a mapping when the header is not recognised, then uses it', async () => {
    const { token } = await signedInUser();
    const csv = `When;What;How much\n${daysAgo(5)};Rent;-15000,00\n`;
    const preview = await upload(token, 'import/preview', 'x.csv', csv);
    expect(preview.body.data).toMatchObject({ needsMapping: true, csv: { delimiter: ';', columns: ['When', 'What', 'How much'], suggestedMapping: null } });
    expect((await upload(token, 'import', 'x.csv', csv)).body.error).toMatchObject({ code: 'MAPPING_REQUIRED' });

    const mapping = { headerRow: 1, dateColumn: 'When', descriptionColumn: 'What', amountColumn: 'How much', dateOrder: 'YMD' };
    const res = await upload(token, 'import', 'x.csv', csv, { mapping });
    expect(res.body.data).toMatchObject({ created: 1, invalid: 0 });
    const bad = await upload(token, 'import', 'x.csv', csv, { mapping: { ...mapping, amountColumn: 'Nope' } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('Nope');
    expect(await uploadDirIsEmpty()).toBe(true);
  });

  it('imports OFX with its own currency and ids, and refuses other files', async () => {
    const { user, token } = await signedInUser();
    const d = daysAgo(4).replace(/-/g, '');
    const ofx = `OFXHEADER:100\n<OFX><CURDEF>USD\n<STMTTRN><DTPOSTED>${d}<TRNAMT>-42.17<FITID>F1<NAME>STARBUCKS</STMTTRN></OFX>`;
    const res = await upload(token, 'import', 'bank.qfx', ofx);
    expect(res.body.data).toMatchObject({ format: 'ofx', created: 1 });
    expect(await DetectedTransaction.findOne({ where: { userId: user.id } })).toMatchObject({ currency: 'USD', source: 'ofx', referenceNumber: 'F1' });

    expect((await upload(token, 'import', 'photo.png', 'x')).status).toBe(400);
    expect((await upload(token, 'import', 'empty.csv', '')).body.error).toMatchObject({ code: 'IMPORT_EMPTY' });
    expect((await upload(token, 'import', 'x.csv', 'Date,Amount\n', { format: 'nope' })).status).toBe(400);
  });

  it('imports a 10,000-row CSV in batches with flat memory', async () => {
    const { user, token } = await signedInUser();
    const lines = ['Date,Description,Amount'];
    for (let i = 0; i < 10_000; i += 1) lines.push(`${daysAgo(1 + (i % 300))},Shop ${i % 97},-${(1 + (i % 500)).toFixed(2)}`);
    const csv = lines.join('\n');

    global.gc?.();
    const baseline = process.memoryUsage().heapUsed;
    let peak = baseline;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }, 5);
    const started = Date.now();
    const res = await upload(token, 'import', 'big.csv', csv);
    clearInterval(sampler);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalRows: 10_000, invalid: 0 });
    expect(res.body.data.created + res.body.data.needsReview).toBe(10_000);
    expect(await DetectedTransaction.count({ where: { userId: user.id } })).toBe(10_000);
    // The request body, test strings and 100 batches all share this process; the bound is loose
    // on purpose. Reading the whole file into rows first would add far more than this.
    expect(peak - baseline).toBeLessThan(150 * 1024 * 1024);
    expect(Date.now() - started).toBeLessThan(120_000);
  }, 180_000);
});
