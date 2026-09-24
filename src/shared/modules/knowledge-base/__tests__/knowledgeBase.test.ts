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
import { setupTestDb, createTestUser } from '@testHelpers';
import { getDetectionConfig } from '@modules/transaction-detection/transactionDetection.service';
import { parseCsv, runImport } from '../knowledgeBase.importers';
import { coverageByCountry } from '../knowledgeBase.repository';
import { buildPack, getPackForClient } from '../packBuilder.service';
import { enrichMerchant, enrichmentProvider, registerEnrichmentProvider } from '../merchantEnrichment';
import { getKnowledgePack } from '../../../../mobile/features/transaction-detection/transactionDetection.controller';

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
});
