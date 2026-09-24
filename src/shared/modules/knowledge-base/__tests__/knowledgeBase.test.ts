import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QueryTypes } from 'sequelize';
import {
  applyPackDelta,
  generateSigningKeyPair,
  toBase64,
  verifyKnowledgePack,
  type KnowledgePack,
  type KnowledgePackDelta,
  type SignedKnowledgePack,
} from '@budgetbrain/detection-core';
import { sequelize } from '@database/models';
import { env } from '@config/env';
import { redis } from '@core/cache/redis.client';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import { getDetectionConfig } from '@modules/transaction-detection/transactionDetection.service';
import { parseCsv, runImport } from '../knowledgeBase.importers';
import { convertFdicInstitutions, convertIfscBankNames, convertNsiBrands, institutionSlug } from '../knowledgeBase.sources';
import { coverageByCountry } from '../knowledgeBase.repository';
import { buildPack, getPackForClient, loadLatestPack } from '../packBuilder.service';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { generateAccessToken } from '@core/auth/jwt';
import adminApp from '../../../../admin/app';
import { submitSkeletons } from '@modules/transaction-detection/skeletons.service';
import { enrichMerchant, enrichmentProvider, registerEnrichmentProvider } from '../merchantEnrichment';
import { getKnowledgePack } from '@modules/transaction-detection/transactionDetection.controller';

const KB_TABLES = [
  'kb_import_runs',
  'kb_pack_versions',
  'kb_kill_switches',
  'kb_payment_rails',
  'kb_currencies',
  'kb_mcc_categories',
  'kb_merchant_aliases',
  'kb_merchants',
  'kb_templates',
  'kb_lexicons',
  'kb_institution_senders',
  'kb_institutions',
  'kb_category_taxonomy',
];
const { privateKey, publicKey } = generateSigningKeyPair();
const trusted = { 'test-kb': publicKey };
const written: string[] = [];
const savedAws = { id: env.AWS_ACCESS_KEY_ID, secret: env.AWS_SECRET_ACCESS_KEY };

function uploadedFile(url: string): string {
  const file = path.join(process.cwd(), 'uploads', path.basename(url));
  written.push(file);
  return file;
}

async function count(sql: string): Promise<number> {
  const [row] = await sequelize.query<{ n: number }>(sql, { type: QueryTypes.SELECT });
  return Number(row?.n ?? 0);
}

describe('knowledge base (Phase 4)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await sequelize.query(`TRUNCATE ${KB_TABLES.join(', ')} CASCADE`);
    await redis.del('kb:pack:manifest:IN', 'kb:kill-switches');
    env.PACK_SIGNING_KEY = toBase64(privateKey);
    env.PACK_KEY_ID = 'test-kb';
    // Packs go to the local uploads folder in tests, never to S3.
    env.AWS_ACCESS_KEY_ID = undefined;
    env.AWS_SECRET_ACCESS_KEY = undefined;
  });

  afterAll(async () => {
    for (const file of written) if (existsSync(file)) unlinkSync(file);
    await redis.del('kb:pack:manifest:IN', 'kb:kill-switches');
    env.AWS_ACCESS_KEY_ID = savedAws.id;
    env.AWS_SECRET_ACCESS_KEY = savedAws.secret;
  });

  describe('importers (T4.2)', () => {
    it('seeds the baseline pack, and a re-run creates no duplicates and no new versions', async () => {
      const first = await runImport('seed-pack');
      expect(first.rowsWritten).toBeGreaterThan(50);
      const before = await count(`SELECT COUNT(*) AS n FROM kb_merchant_aliases`);
      const versions = await count(`SELECT SUM(version) AS n FROM kb_merchants`);
      await runImport('seed-pack');
      expect(await count(`SELECT COUNT(*) AS n FROM kb_merchant_aliases`)).toBe(before);
      expect(await count(`SELECT SUM(version) AS n FROM kb_merchants`)).toBe(versions);
      const [coverage] = await coverageByCountry();
      expect(coverage).toMatchObject({ country: 'IN', institutions: 6, senders: 11 });
      expect(await count(`SELECT COUNT(*) AS n FROM kb_import_runs WHERE importer = 'seed-pack' AND status = 'succeeded'`)).toBe(2);
    });

    it('loads every ISO 4217 code without wiping pack symbols', async () => {
      await runImport('iso4217');
      expect(await count(`SELECT COUNT(*) AS n FROM kb_currencies`)).toBeGreaterThan(150);
      const [inr] = await sequelize.query<{ symbols: string[] }>(`SELECT symbols FROM kb_currencies WHERE code = 'INR'`, {
        type: QueryTypes.SELECT,
      });
      expect(inr?.symbols).toContain('₹');
    });

    it('imports institutions and senders from CSV, and records the source', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'kb-'));
      const file = path.join(dir, 'banks.csv');
      writeFileSync(
        file,
        'id,name,display_name,country,type,bic,verified,sms_headers,email_domains\n' +
          'in.yes_bank,"YES Bank Limited","YES Bank",IN,bank,YESBINBB,true,YESBNK|YESBKR,yesbank.in\n'
      );
      const result = await runImport('csv-institutions', { file });
      expect(result.rowsWritten).toBe(4);
      expect(await count(`SELECT COUNT(*) AS n FROM kb_institution_senders WHERE institution_id = 'in.yes_bank'`)).toBe(3);
      expect(await count(`SELECT COUNT(*) AS n FROM kb_import_runs WHERE source_url = '${file}'`)).toBe(1);
    });

    it('parses quoted CSV fields with commas, quotes and CRLF', () => {
      expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
    });

    it('rolls back a failed run and marks it failed', async () => {
      await expect(runImport('csv-merchants', { file: '/does/not/exist.csv' })).rejects.toThrow();
      expect(await count(`SELECT COUNT(*) AS n FROM kb_import_runs WHERE importer = 'csv-merchants' AND status = 'failed'`)).toBe(1);
    });

    it('downloads the IFSC bank list outside the transaction, fills codes on curated banks and adds the rest for review', async () => {
      const urls: string[] = [];
      const fetchText = async (url: string) => {
        urls.push(url);
        return JSON.stringify({ HDFC: 'HDFC Bank', YESB: 'Yes Bank Ltd', ZZQB: 'Zed Quay Co-operative Bank', bad: 'x' });
      };
      const first = await runImport('ifsc', { fetchText });
      expect(urls).toEqual(['https://raw.githubusercontent.com/razorpay/ifsc/master/src/banknames.json']);
      // HDFC already has its prefix; YES Bank (curated by the CSV test) gains one; Zed is new.
      expect(first.rowsWritten).toBe(2);
      const [yes] = await sequelize.query<{ codes: Record<string, string>; status: string; name: string; verified: boolean }>(
        `SELECT codes, status, name, verified FROM kb_institutions WHERE id = 'in.yes_bank'`,
        { type: QueryTypes.SELECT }
      );
      expect(yes).toEqual({ codes: { ifscPrefix: 'YESB' }, status: 'published', name: 'YES Bank Limited', verified: true });
      const [zed] = await sequelize.query<{ status: string; verified: boolean; source: string }>(
        `SELECT status, verified, source FROM kb_institutions WHERE id = 'in.zed_quay_co_operative_bank'`,
        { type: QueryTypes.SELECT }
      );
      expect(zed).toEqual({ status: 'review', verified: false, source: 'ifsc' });

      expect((await runImport('ifsc', { fetchText })).rowsWritten).toBe(0);
      expect(
        await count(`SELECT COUNT(*) AS n FROM kb_import_runs WHERE importer = 'ifsc' AND status = 'succeeded' AND licence = 'MIT'`)
      ).toBe(2);
    });

    it('adds Name Suggestion Index brands once, skipping brands the catalog has, for review', async () => {
      const nsi = {
        nsi: {
          'brands/shop/supermarket': {
            items: [
              { displayName: 'Zedmart', locationSet: { include: ['in'] }, tags: { brand: 'Zedmart', 'brand:wikidata': 'Q999001', name: 'Zedmart Hypermarket' } },
              { displayName: 'Amazon Fresh', locationSet: { include: ['001'] }, tags: { brand: 'Amazon', 'brand:wikidata': 'Q3884' } },
              { displayName: 'Nowhere Mart', locationSet: { include: ['br'] }, tags: { brand: 'Nowhere Mart', 'brand:wikidata': 'Q999002' } },
              { displayName: 'No Wikidata', locationSet: { include: ['in'] }, tags: { brand: 'No Wikidata' } },
            ],
          },
          'brands/amenity/bench': { items: [{ displayName: 'Bench Co', locationSet: { include: ['in'] }, tags: { brand: 'Bench Co', 'brand:wikidata': 'Q999003' } }] },
        },
      };
      const fetchText = async () => JSON.stringify(nsi);
      const first = await runImport('nsi-wikidata', { fetchText, countries: ['IN'] });
      expect(first.rowsWritten).toBe(3); // Zedmart + its aliases "zedmart" and "zedmart hypermarket"
      const [zed] = await sequelize.query<{ id: string; country: string; taxonomy_code: string; status: string }>(
        `SELECT id, country, taxonomy_code, status FROM kb_merchants WHERE wikidata_id = 'Q999001'`,
        { type: QueryTypes.SELECT }
      );
      expect(zed).toEqual({ id: 'm.wd_q999001', country: 'IN', taxonomy_code: 'FOOD_AND_DRINK.GROCERIES', status: 'review' });
      expect(await count(`SELECT COUNT(*) AS n FROM kb_merchants WHERE wikidata_id = 'Q3884'`)).toBe(1);
      expect(await count(`SELECT COUNT(*) AS n FROM kb_merchants WHERE wikidata_id IN ('Q999002', 'Q999003')`)).toBe(0);
      expect((await runImport('nsi-wikidata', { fetchText, countries: ['IN'] })).rowsWritten).toBe(0);
    });

    it('converts the FDIC format and rejects a source in the wrong format', () => {
      const fdic = JSON.stringify({
        data: [
          { data: { NAME: 'First Example Bank, National Association', CERT: 12345, WEBADDR: 'www.firstexample.com' } },
          { data: { NAME: '', CERT: 1 } },
        ],
      });
      expect(convertFdicInstitutions(fdic)).toEqual([
        {
          id: 'us.first_example_bank_12345',
          name: 'First Example Bank, National Association',
          displayName: 'First Example Bank, National Association',
          country: 'US',
          type: 'bank',
          codes: { fdicCert: '12345' },
          domains: ['firstexample.com'],
          verified: false,
        },
      ]);
      expect(institutionSlug('The Saraswat Co-operative Bank Ltd.')).toBe('saraswat_co_operative_bank');
      expect(() => convertIfscBankNames('<html>')).toThrow('IFSC');
      expect(() => convertNsiBrands('[]')).toThrow('Name Suggestion Index');
    });
  });

  describe('pack builder and endpoint (T4.3)', () => {
    let v1: SignedKnowledgePack;

    it('builds a signed pack that verifies in core, and does nothing when unchanged', async () => {
      const built = await buildPack('IN');
      expect(built).toEqual({ version: 1, built: true });
      const client = await getPackForClient('in', null);
      expect(client).toMatchObject({ country: 'IN', version: 1, delta: null });
      v1 = JSON.parse(readFileSync(uploadedFile(client!.url), 'utf8')) as SignedKnowledgePack;
      const pack = verifyKnowledgePack(v1, trusted);
      expect(pack.institutions.map((i) => i.id)).toContain('in.yes_bank');
      expect(pack.merchants.find((m) => m.id === 'm.amazon')?.country).toBeNull();
      expect(await buildPack('IN')).toEqual({ version: 1, built: false });
    });

    it('a catalog change makes version 2 with a delta that applies to version 1', async () => {
      await sequelize.query(
        `INSERT INTO kb_merchant_aliases (merchant_id, alias_key, country, source) VALUES ('m.zomato', 'zomato media', 'IN', 'manual')`
      );
      expect(await buildPack('IN')).toEqual({ version: 2, built: true });
      const client = await getPackForClient('IN', 1);
      expect(client?.version).toBe(2);
      expect(client?.delta?.baseVersion).toBe(1);
      uploadedFile(client!.url);
      const delta = JSON.parse(readFileSync(uploadedFile(client!.delta!.url), 'utf8')) as KnowledgePackDelta;
      const applied: KnowledgePack = applyPackDelta(v1.payload, delta, trusted).payload;
      expect(applied.merchantAliases.some((a) => a.alias === 'zomato media')).toBe(true);
      expect(client!.delta!.bytes).toBeLessThan(client!.bytes / 5);
    });

    it('answers from the Redis manifest without touching the database', async () => {
      const spy = sequelize.query.bind(sequelize);
      let queries = 0;
      (sequelize as unknown as { query: typeof spy }).query = ((...args: Parameters<typeof spy>) => {
        queries += 1;
        return spy(...args);
      }) as typeof spy;
      try {
        await getPackForClient('IN', null);
      } finally {
        (sequelize as unknown as { query: typeof spy }).query = spy;
      }
      expect(queries).toBe(0);
    });

    it('the endpoint sends an ETag and answers 304 when the client already has the pack', async () => {
      const headers: Record<string, string> = {};
      const res = {
        statusCode: 200,
        body: undefined as unknown,
        setHeader: (k: string, v: string) => (headers[k] = v),
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(body: unknown) {
          this.body = body;
          return this;
        },
        end() {
          return this;
        },
      };
      const req = (ifNoneMatch?: string) =>
        ({ query: { country: 'IN' }, header: (name: string) => (name === 'If-None-Match' ? ifNoneMatch : undefined) }) as never;
      await getKnowledgePack(req(), res as never);
      expect(res.statusCode).toBe(200);
      const etag = headers.ETag!;
      expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
      await getKnowledgePack(req(etag), res as never);
      expect(res.statusCode).toBe(304);
    });

    it('refuses to build without a signing key', async () => {
      const saved = env.PACK_SIGNING_KEY;
      env.PACK_SIGNING_KEY = undefined;
      await sequelize.query(`UPDATE kb_merchants SET mcc = '5815' WHERE id = 'm.zomato'`);
      try {
        await expect(buildPack('IN')).rejects.toThrow(/PACK_SIGNING_KEY/);
      } finally {
        env.PACK_SIGNING_KEY = saved;
      }
    });
  });

  describe('kill switches (T4.6)', () => {
    it('config carries active switches', async () => {
      const user = await createTestUser();
      await sequelize.query(
        `INSERT INTO kb_kill_switches (scope, key, action, reason) VALUES ('institution', 'in.hdfc_bank', 'disable_auto_create', 'template change')`
      );
      await redis.del('kb:kill-switches');
      const config = await getDetectionConfig(user.id);
      expect(config.killSwitches).toEqual([
        { scope: 'institution', key: 'in.hdfc_bank', action: 'disable_auto_create', reason: 'template change' },
      ]);
    });
  });

  describe('merchant enrichment (T4.7)', () => {
    it('is off by default and sends nothing', async () => {
      let calls = 0;
      registerEnrichmentProvider({
        name: 'spy',
        async enrich() {
          calls += 1;
          return null;
        },
      });
      expect(enrichmentProvider().name).toBe('none');
      expect(await enrichMerchant('SWIGGY*BANGALORE', 'IN')).toBeNull();
      expect(calls).toBe(0);
    });
  });
  describe('admin catalog, packs, kill switches and learning (Phase 7)', () => {
    let admin: string;
    let token: string;
    let server: Server;
    const call = async (method: string, url: string, body?: unknown) => {
      const res = await fetch(`${admin}${url}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: (await res.json()) as any };
    };

    beforeAll(async () => {
      server = await new Promise<Server>((resolve) => {
        const s = adminApp.listen(0, () => resolve(s));
      });
      admin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/admin/detection`;
      const user = await createTestUser({ role: 'admin' } as never);
      token = generateAccessToken({ userId: user.id, email: user.email, role: user.role });
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('a published alias appears in the next pack; drafts and edits do not (T7.3 acceptance)', async () => {
      const merchant = await call('POST', '/catalog/merchants', {
        id: 'm.t7_chaiwala',
        data: { name: 'Chaiwala', country: 'IN', taxonomyCode: 'FOOD_AND_DRINK.RESTAURANT' },
      });
      expect(merchant.status).toBe(201);
      expect(merchant.body.data).toMatchObject({ id: 'm.t7_chaiwala', status: 'draft', version: 1 });
      const alias = await call('POST', '/catalog/aliases', { data: { merchantId: 'm.t7_chaiwala', alias: 'Chaiwala Express', country: 'IN' } });
      expect(alias.body.data).toMatchObject({ alias: 'chaiwala express', status: 'draft' });
      const aliasId = alias.body.data.id as string;

      const hasAlias = async () => {
        await call('POST', '/packs/build', { country: 'IN' });
        const pack = await loadLatestPack('IN');
        return pack!.payload.merchantAliases.some((a) => a.alias === 'chaiwala express');
      };
      expect(await hasAlias()).toBe(false);

      expect((await call('POST', '/catalog/merchants/m.t7_chaiwala/status', { status: 'published' })).body.data.status).toBe('published');
      expect((await call('POST', `/catalog/aliases/${aliasId}/status`, { status: 'review' })).body.data.status).toBe('review');
      expect((await call('POST', `/catalog/aliases/${aliasId}/status`, { status: 'published' })).body.data.status).toBe('published');
      expect(await hasAlias()).toBe(true);

      // An edit returns the row to draft (version 2) and takes it out of the next pack.
      const edited = await call('PATCH', `/catalog/aliases/${aliasId}`, { data: { alias: 'chaiwala exp' } });
      expect(edited.body.data).toMatchObject({ status: 'draft', version: 2, alias: 'chaiwala exp' });
      expect(await hasAlias()).toBe(false);
      expect((await call('POST', `/catalog/aliases/${aliasId}/status`, { status: 'published' })).status).toBe(200);
      expect((await call('POST', `/catalog/aliases/${aliasId}/status`, { status: 'review' })).status).toBe(400);

      const history = await call('GET', `/catalog/aliases/${aliasId}/history`);
      expect(history.body.data.map((h: any) => h.action)).toEqual(['publish', 'update', 'publish', 'review', 'create']);
      expect(await count(`SELECT count(*) AS n FROM audit_logs WHERE action = 'kb.publish' AND metadata->>'id' = '${aliasId}'`)).toBe(2);

      const list = await call('GET', '/catalog/aliases?q=chaiwala');
      expect(list.body.data.items).toHaveLength(1);
      expect((await call('POST', '/catalog/aliases', { data: { merchantId: 'm.t7_chaiwala', alias: 'chaiwala exp', country: 'IN' } })).status).toBe(409);
      expect((await call('POST', '/catalog/aliases', { data: { merchantId: 'm.nope', alias: 'nope', country: 'IN' } })).status).toBe(400);
      expect((await call('POST', '/catalog/merchants', { id: 'Bad Id', data: { name: 'x', taxonomyCode: 'FOOD_AND_DRINK' } })).status).toBe(400);
    });

    it('a template is published only with a sample message it matches (T7.3, T7.4)', async () => {
      const skeleton = 'Rs <AMT> paid to <NAME> from HDFC Bank A/c <ACCT> on <DATE>';
      const data = {
        institutionId: 'in.hdfc_bank',
        language: 'en',
        skeleton,
        fields: ['amount', 'merchant', 'account', 'date'],
        direction: 'DEBIT',
        transactionType: 'expense',
      };
      await call('POST', '/catalog/templates', { id: 't.hdfc.t7_paid', data });
      expect((await call('POST', '/catalog/templates/t.hdfc.t7_paid/status', { status: 'published' })).body.error.code).toBe('TEMPLATE_SAMPLE_REQUIRED');
      await call('PATCH', '/catalog/templates/t.hdfc.t7_paid', { data: { sample: 'Rs 99 paid to Someone Else via UPI' } });
      expect((await call('POST', '/catalog/templates/t.hdfc.t7_paid/status', { status: 'published' })).body.error.code).toBe('TEMPLATE_SAMPLE_MISMATCH');
      await call('PATCH', '/catalog/templates/t.hdfc.t7_paid', { data: { sample: 'Rs 99.00 paid to Tea Stall from HDFC Bank A/c XX1234 on 12-09-26' } });
      expect((await call('POST', '/catalog/templates/t.hdfc.t7_paid/status', { status: 'published' })).body.data.status).toBe('published');
    });

    it('turns kill switches on and off for clients at once, with an audit row (T7.3, T7.7)', async () => {
      const user = await createTestUser();
      const created = await call('POST', '/kill-switches', { scope: 'template', key: 't.hdfc.t7_paid', action: 'disable_detection', reason: 'wrong amounts' });
      expect(created.status).toBe(201);
      const has = async () => (await getDetectionConfig(user.id)).killSwitches.some((k) => k.key === 't.hdfc.t7_paid');
      expect(await has()).toBe(true);
      await call('PATCH', `/kill-switches/${created.body.data.id}`, { active: false, reason: 'fixed in pack v9' });
      expect(await has()).toBe(false);
      expect(await count(`SELECT count(*) AS n FROM audit_logs WHERE action = 'kb.kill_switch_change' AND resource_id = '${created.body.data.id}'`)).toBe(2);
      expect((await call('GET', '/kill-switches')).body.data.find((k: any) => k.id === created.body.data.id)).toMatchObject({ active: false, reason: 'fixed in pack v9' });
    });

    it('turns a shape k users sent into a draft template, then takes it off the queue (T7.4)', async () => {
      const skeleton = 'Rs.<AMT> debited from HDFC Bank A/c <ACCT> for <NAME> on <DATE>';
      for (let i = 0; i < 10; i += 1) {
        const user = await createTestUser({ detectionTemplateLearning: true } as never);
        await submitSkeletons(user.id, {
          items: [{ skeletonHash: '0'.repeat(64), skeleton, institutionId: 'in.hdfc_bank', senderKey: 'HDFCBK', country: 'IN', language: 'en', correctedField: 'merchant' }],
        });
      }
      const group = (await call('GET', '/skeletons')).body.data.find((g: any) => g.skeleton === skeleton);
      expect(group).toMatchObject({ users: 10, correctedFields: ['merchant'] });
      const body = {
        id: 't.hdfc.t7_learned',
        institutionId: 'in.hdfc_bank',
        language: 'en',
        fields: ['amount', 'account', 'merchant', 'date'],
        direction: 'DEBIT',
        transactionType: 'expense',
        sample: 'Rs.10.00 debited from HDFC Bank A/c XX1111 for Book Shop on 01-09-26',
      };
      expect((await call('POST', `/skeletons/${group.skeletonHash}/template`, { ...body, fields: ['amount'] })).body.error.code).toBe('TEMPLATE_FIELDS');
      const created = await call('POST', `/skeletons/${group.skeletonHash}/template`, body);
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ id: 't.hdfc.t7_learned', status: 'draft', skeleton, sample: body.sample });
      expect(await count(`SELECT count(*) AS n FROM kb_templates WHERE id = 't.hdfc.t7_learned' AND source = 'learned'`)).toBe(1);
      expect((await call('GET', '/skeletons')).body.data.some((g: any) => g.skeletonHash === group.skeletonHash)).toBe(false);
    });

    it('promotes an alias candidate to a draft global alias (T7.5)', async () => {
      const key = 'tea trails t7';
      for (let i = 0; i < 10; i += 1) {
        const user = await createTestUser();
        const cat = await createTestCategory(user.id, { name: 'Food' });
        await sequelize.query(
          `INSERT INTO merchant_category_rules (id, user_id, merchant, category_id, created_at, updated_at) VALUES (gen_random_uuid(), :u, :m, :c, NOW(), NOW())`,
          { replacements: { u: user.id, m: key, c: cat.id } }
        );
      }
      expect((await call('POST', '/alias-candidates/promote', { aliasKey: 'not a candidate', merchantId: 'm.t7_chaiwala' })).status).toBe(404);
      const promoted = await call('POST', '/alias-candidates/promote', { aliasKey: key, merchantId: 'm.t7_chaiwala' });
      expect(promoted.body.data).toMatchObject({ alias: key, country: '', status: 'draft', source: 'crowd' });
      expect((await call('GET', '/alias-candidates')).body.data.some((c: any) => c.aliasKey === key)).toBe(false);
    });
  });
});
