import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { QueryTypes } from 'sequelize';
import { MerchantCategoryRule, sequelize } from '@database/models';
import { generateAccessToken } from '@core/auth/jwt';
import { redis } from '@core/cache/redis.client';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import webApp from '../../../../web/app';
import mobileApp from '../../../../mobile/app';
import { __resetServerPackForTests } from '@modules/knowledge-base/serverPack.service';

/**
 * HTTP-level checks for Phase 6 (T6.1–T6.3) through the real web and mobile apps: routing,
 * authentication, validation and the error handler, not just the services.
 */

const servers: Server[] = [];
async function listen(app: typeof webApp): Promise<string> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
}

let web: string;
let mobile: string;

async function call(base: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function signedInUser() {
  const user = await createTestUser();
  return { user, token: generateAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}

/** A bank SMS dated today, carrying a marker that must never be stored. */
function bankSms(marker: string, ref: string) {
  const d = new Date();
  const day = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(2)}`;
  return `Rs.1,250.00 debited from a/c **1234 on ${day} to VPA swiggy@icici Ref ${ref}. Avl Bal Rs 20,500.00. Not you? Quote ${marker}`;
}

/** Every text-like column of every table that contains `needle`. */
async function tablesContaining(needle: string): Promise<string[]> {
  const columns = await sequelize.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'ARRAY')`,
    { type: QueryTypes.SELECT }
  );
  const hits: string[] = [];
  for (const { table_name, column_name } of columns) {
    const [row] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM "${table_name}" WHERE "${column_name}"::text LIKE :pattern`,
      { type: QueryTypes.SELECT, replacements: { pattern: `%${needle}%` } }
    );
    if (Number(row.n) > 0) hits.push(`${table_name}.${column_name}`);
  }
  return hits;
}

describe('detection over HTTP (Phase 6)', () => {
  beforeAll(async () => {
    await setupTestDb();
    __resetServerPackForTests();
    // The ingest limit (15 a minute per client) is kept in Redis, so back-to-back runs share it.
    const limited = await redis.keys('rl:ingest:*');
    if (limited.length > 0) await redis.del(...limited);
    web = await listen(webApp);
    mobile = await listen(mobileApp);
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  });

  it('the web API serves the review inbox with the same router as mobile (T6.1)', async () => {
    const { token } = await signedInUser();
    const res = await call(web, token, 'GET', '/detected-transactions/pending');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], pagination: { total: 0 } });
    expect((await call(web, 'bad-token', 'GET', '/detected-transactions/pending')).status).toBe(401);
  });

  it('parses a pasted SMS on the server and stores no part of its text (T6.2)', async () => {
    const { user, token } = await signedInUser();
    const marker = `ZQXV${Date.now()}`;
    const res = await call(web, token, 'POST', '/detected-transactions/ingest', {
      kind: 'sms',
      sender: 'VM-HDFCBK',
      text: bankSms(marker, '425612345678'),
    });
    expect(res.status).toBe(200);
    expect(['created', 'needs_review']).toContain(res.body.data.status);
    expect(res.body.data.detected).toMatchObject({ amount: '1250.00', source: 'pasted_sms', accountTail: '1234' });
    expect(JSON.stringify(res.body)).not.toContain(marker);
    // The scan itself works: it finds what is stored, such as the user's email.
    expect(await tablesContaining(user.email)).toContain('users.email');
    expect(await tablesContaining(marker)).toEqual([]);
    expect(await tablesContaining('Avl Bal')).toEqual([]);

    // The same message again is the same record.
    const again = await call(web, token, 'POST', '/detected-transactions/ingest', {
      kind: 'sms',
      sender: 'VM-HDFCBK',
      text: bankSms(marker, '425612345678'),
    });
    expect(again.body.data.status).toBe('already_synced');
    const [{ n }] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM detected_transactions WHERE user_id = :userId`,
      { type: QueryTypes.SELECT, replacements: { userId: user.id } }
    );
    expect(Number(n)).toBe(1);
  });

  it('asks for the bank when pasted text has no sender, and accepts the bank instead (T6.2)', async () => {
    const { token } = await signedInUser();
    const text = bankSms('NOSENDER', '425612345679');
    const unknown = await call(mobile, token, 'POST', '/detected-transactions/ingest', { kind: 'sms', text });
    expect(unknown.body.data).toMatchObject({ status: 'ignored', reason: 'unknown_sender', detected: null });

    const banks = await call(mobile, token, 'GET', '/detected-transactions/institutions');
    expect(banks.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'in.hdfc_bank' })]));

    const picked = await call(mobile, token, 'POST', '/detected-transactions/ingest', { kind: 'sms', text, institutionId: 'in.hdfc_bank' });
    expect(['created', 'needs_review']).toContain(picked.body.data.status);
  });

  it('tells the bank from the text of a pasted SMS without a sender, and holds it for review (T3.2)', async () => {
    const { token } = await signedInUser();
    const text = 'Rs.499.00 debited from your HDFC Bank a/c **1234 to VPA zomato@hdfcbank Ref 425699900011';
    const res = await call(mobile, token, 'POST', '/detected-transactions/ingest', { kind: 'sms', text });
    expect(res.body.data).toMatchObject({ status: 'needs_review' });
    expect(res.body.data.detected).toMatchObject({ institutionId: 'in.hdfc_bank', confidenceTier: 'medium', source: 'pasted_sms' });

    // A pasted email still needs its sender address.
    const email = await call(mobile, token, 'POST', '/detected-transactions/ingest', { kind: 'email', text });
    expect(email.body.data).toMatchObject({ status: 'ignored', reason: 'unknown_sender' });
  });

  it('parses a forwarded bank email by its sender domain (T6.2)', async () => {
    const { token } = await signedInUser();
    const res = await call(web, token, 'POST', '/detected-transactions/ingest', {
      kind: 'email',
      sender: 'alerts@hdfcbank.net',
      subject: 'Transaction alert',
      text: bankSms('EMAILMARK', '425612345680'),
    });
    expect(res.body.data.detected).toMatchObject({ source: 'email', institutionId: 'in.hdfc_bank' });
  });

  it('rejects oversized or unknown fields before parsing', async () => {
    const { token } = await signedInUser();
    expect((await call(web, token, 'POST', '/detected-transactions/ingest', { kind: 'sms', text: '' })).status).toBe(400);
    expect(
      (await call(web, token, 'POST', '/detected-transactions/ingest', { kind: 'sms', text: 'x', rawContent: 'y' })).status
    ).toBe(400);
  });

  it('routes /rules before /:id, and manages single rules (T5.7, T6.4)', async () => {
    const { user, token } = await signedInUser();
    const food = await createTestCategory(user.id, { name: 'Food' });
    const office = await createTestCategory(user.id, { name: 'Office' });
    const a = await MerchantCategoryRule.create({ userId: user.id, merchant: 'zomato', categoryId: food.id });
    await MerchantCategoryRule.create({ userId: user.id, merchant: 'swiggy', categoryId: food.id });

    const patched = await call(web, token, 'PATCH', `/detected-transactions/rules/${a.id}`, { categoryId: office.id });
    expect(patched.body.data).toMatchObject({ merchant: 'zomato', categoryId: office.id, categoryName: 'Office' });
    expect((await call(web, token, 'DELETE', `/detected-transactions/rules/${a.id}`)).body.data).toEqual({ deleted: 1 });
    expect((await call(web, token, 'DELETE', `/detected-transactions/rules/${a.id}`)).status).toBe(404);

    // Phase 5's "Reset learned preferences" path, which '/:id' used to swallow.
    const reset = await call(mobile, token, 'DELETE', '/detected-transactions/rules');
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ deleted: 1 });
  });

  it('answers 410 Gone on the retired /integrations endpoints (T6.3)', async () => {
    const { token } = await signedInUser();
    for (const base of [web, mobile]) {
      const res = await call(base, token, 'POST', '/integrations/sms', { content: 'Rs 10 debited' });
      expect(res.status).toBe(410);
      expect(res.body.error).toMatchObject({ code: 'ENDPOINT_RETIRED' });
    }
  });
});
