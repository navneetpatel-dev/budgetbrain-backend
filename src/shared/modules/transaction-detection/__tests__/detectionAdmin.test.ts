import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { QueryTypes } from 'sequelize';
import { AuditLog, DetectedTransaction, MerchantCategoryRule, User, sequelize } from '@database/models';
import { generateAccessToken } from '@core/auth/jwt';
import { redis } from '@core/cache/redis.client';
import { setupTestDb, createTestUser, createTestCategory } from '@testHelpers';
import adminApp from '../../../../admin/app';
import mobileApp from '../../../../mobile/app';
import { deleteUserAccount } from '@modules/users/users.service';
import { syncBatch, undoDetected } from '../transactionDetection.service';
import { getDetectionDashboard, listAliasCandidates, runDetectionRetention, runDetectionRollup } from '../detectionAdmin.service';
import { listSkeletonQueue, userHash } from '../skeletons.service';
import { makeSignedItem } from './fixtures';

/**
 * Phase 7 (T7.1, T7.2, T7.4–T7.7) through the real admin and mobile apps. Catalog, packs and
 * kill switches (which write the kb_* tables) are tested in knowledgeBase.test.ts.
 */

const servers: Server[] = [];
async function listen(app: typeof adminApp): Promise<string> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
}

let admin: string;
let mobile: string;
let adminToken: string;

async function call(base: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}

async function signedIn(overrides: Record<string, unknown> = {}) {
  const user = await createTestUser(overrides as never);
  return { user, token: generateAccessToken({ userId: user.id, email: user.email, role: user.role }) };
}

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
let ref = 0;
const item = (userId: string, overrides: Record<string, unknown> = {}) => {
  ref += 1;
  return makeSignedItem(userId, {
    clientId: `a${ref}`,
    transactionDate: today,
    receivedAt: new Date().toISOString(),
    referenceNumber: `ADM${String(ref).padStart(9, '0')}`,
    ...overrides,
  });
};

// Unique per run (letters only: skeletons carry no digits), so earlier runs can't reach k for it.
const RUN_WORD = [...Date.now().toString(36)].map((c) => String.fromCharCode(97 + (parseInt(c, 36) % 26))).join('');
const SKELETON = `Rs.<AMT> debited from a/c <ACCT> on <DATE> to <NAME> via ${RUN_WORD}. Ref <REF>`;

describe('detection admin and learning (Phase 7)', () => {
  beforeAll(async () => {
    await setupTestDb();
    admin = await listen(adminApp);
    mobile = await listen(mobileApp);
    const { token } = await signedIn({ role: 'admin' });
    adminToken = token;
    const limited = await redis.keys('rl:*');
    if (limited.length > 0) await redis.del(...limited);
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  });

  it('admin routes need an admin', async () => {
    const { token } = await signedIn();
    expect((await call(admin, token, 'GET', '/admin/detection/dashboard')).status).toBe(403);
    expect((await call(admin, adminToken, 'GET', '/admin/detection/dashboard')).status).toBe(200);
  });

  it('stores daily diagnostics counts, replaces a re-uploaded day, and shows them to support (T7.1)', async () => {
    const { user, token } = await signedIn();
    const rows = [
      { day: today, stage: 'INELIGIBLE', reasonCode: 'otp_marker', institutionId: 'in.hdfc_bank', count: 3 },
      { day: today, stage: 'PARSE_FAILED', reasonCode: 'no_amount', institutionId: null, count: 1 },
    ];
    expect((await call(mobile, token, 'POST', '/detected-transactions/diagnostics', { rows })).status).toBe(200);
    await call(mobile, token, 'POST', '/detected-transactions/diagnostics', { rows: [{ ...rows[0], count: 4 }] });

    const tab = await call(admin, adminToken, 'GET', `/admin/detection/users/${user.id}`);
    expect(tab.body.data.diagnostics).toEqual([
      expect.objectContaining({ day: today, stage: 'INELIGIBLE', reasonCode: 'otp_marker', institutionId: 'in.hdfc_bank', count: 4 }),
    ]);
    // Closed lists only: no free text, no unknown reasons.
    expect((await call(mobile, token, 'POST', '/detected-transactions/diagnostics', { rows: [{ ...rows[0], reasonCode: 'Rs 500 at SWIGGY' }] })).status).toBe(400);
    expect((await call(mobile, token, 'POST', '/detected-transactions/diagnostics', { rows: [{ ...rows[0], text: 'x' }] })).status).toBe(400);
  });

  it('rolls up detections by day, source, status and institution, including undo (T7.2)', async () => {
    const { user } = await signedIn();
    const inst = `test.rollup_${Date.now()}`;
    const weak = { templateMatched: false, institutionVerified: true, amountRoleUnique: true, directionUnambiguous: true, merchantKnown: false, dateExtracted: false, referencePresent: false, merchantFuzzy: false };
    const res = await syncBatch(user.id, {
      items: [item(user.id, { institutionId: inst }), item(user.id, { institutionId: inst }), item(user.id, { institutionId: inst, evidence: weak })],
    });
    await runDetectionRollup();
    await undoDetected(user.id, res.results[0]!.detectedId!);
    const second = await runDetectionRollup();
    expect(second.days).toBeGreaterThanOrEqual(1);

    const dash = await call(admin, adminToken, 'GET', `/admin/detection/dashboard?from=${today}&to=${today}`);
    const row = dash.body.data.byInstitution.find((r: any) => r.institutionId === inst);
    expect(row).toMatchObject({ count: 3, autoApproved: 1, review: 1, rejected: 1 });
    expect(dash.body.data.series.find((d: any) => d.day === today)).toBeTruthy();
    expect(dash.body.data.adoption.activeUsers30d).toBeGreaterThan(0);
    expect(dash.body.data.counts.auto_approved).toBeGreaterThanOrEqual(1);
    expect(dash.body.data.total).toBe(Object.values(dash.body.data.counts as Record<string, number>).reduce((a, b) => a + b, 0));
    expect(dash.body.data.bySource.find((r: any) => r.source === 'android_sms')?.count).toBeGreaterThanOrEqual(3);
    expect(dash.body.data.byCountry.length).toBeGreaterThan(0);

    // Plan §3.2: the dashboard is at most five indexed queries (it is four).
    let queries = 0;
    const options = (sequelize as unknown as { options: { logging: unknown } }).options;
    const previous = options.logging;
    // Only the dashboard's tables: background work from the undo above may still be logging.
    options.logging = (sql: string) => {
      if (/detection_daily_stats|detection_rollup_state/.test(sql)) queries += 1;
    };
    try {
      await getDetectionDashboard({ from: today, to: today });
    } finally {
      options.logging = previous;
    }
    expect(queries).toBe(4);
    const [stat] = await sequelize.query<{ status: string; count: number }>(
      `SELECT status, count FROM detection_daily_stats WHERE institution_id = :inst AND status = 'undone'`,
      { type: QueryTypes.SELECT, replacements: { inst } }
    );
    expect(Number(stat?.count)).toBe(1);
  });

  it('takes skeletons only with consent, counts users by HMAC, and shows a shape from k users on (T7.4)', async () => {
    const { user, token } = await signedIn();
    const upload = (t: string, skeleton = SKELETON, correctedField: string | null = null) =>
      call(mobile, t, 'POST', '/detected-transactions/skeletons', {
        items: [{ skeletonHash: 'f'.repeat(64), skeleton, institutionId: 'in.hdfc_bank', senderKey: 'HDFCBK', country: 'IN', language: 'en', correctedField }],
      });
    expect((await upload(token)).body.error.code).toBe('TEMPLATE_LEARNING_OFF');
    await call(mobile, token, 'PATCH', '/detected-transactions/settings', { templateLearning: true });
    expect((await call(mobile, token, 'GET', '/detected-transactions/config')).body.data.templateLearning).toBe(true);
    expect((await upload(token)).body.data).toEqual({ accepted: 1 });
    expect((await upload(token)).body.data).toEqual({ accepted: 0 });
    // The same shape again, now naming what the user corrected, records the field (once).
    expect((await upload(token, SKELETON, 'merchant')).body.data).toEqual({ accepted: 1 });
    expect((await upload(token, SKELETON, 'merchant')).body.data).toEqual({ accepted: 0 });
    expect((await upload(token)).body.data).toEqual({ accepted: 0 });
    expect((await upload(token, SKELETON.replace('<AMT>', '500'))).status).toBe(400);

    const rows = await sequelize.query<{ user_hash: string; skeleton_hash: string; corrected_field: string | null }>(
      `SELECT user_hash, skeleton_hash, corrected_field FROM detection_skeleton_submissions WHERE user_hash = :h`,
      { type: QueryTypes.SELECT, replacements: { h: userHash(user.id) } }
    );
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row!.corrected_field).toBe('merchant');
    expect(row!.user_hash).not.toContain(user.id);
    expect(row!.skeleton_hash).not.toBe('f'.repeat(64));

    // Eight more users: nine in total, below k = 10, so admins see nothing.
    for (let i = 0; i < 8; i += 1) {
      const other = await signedIn({ detectionTemplateLearning: true });
      await upload(other.token);
    }
    const hash = row!.skeleton_hash;
    expect((await listSkeletonQueue()).some((g) => g.skeletonHash === hash)).toBe(false);
    expect((await call(admin, adminToken, 'POST', `/admin/detection/skeletons/${hash}/dismiss`)).status).toBe(404);

    const tenth = await signedIn({ detectionTemplateLearning: true });
    await upload(tenth.token);
    const queue = await call(admin, adminToken, 'GET', '/admin/detection/skeletons');
    expect(queue.body.data.find((g: any) => g.skeletonHash === hash)).toMatchObject({
      skeleton: SKELETON,
      users: 10,
      institutionId: 'in.hdfc_bank',
      correctedFields: ['merchant'],
    });

    // Opting out removes what the user sent: the shape drops below k again.
    await call(mobile, tenth.token, 'PATCH', '/detected-transactions/settings', { templateLearning: false });
    expect((await listSkeletonQueue()).some((g) => g.skeletonHash === hash)).toBe(false);
  });

  it('lists merchants that k users gave a rule to as alias candidates (T7.5)', async () => {
    const merchant = `chai point ${Date.now()}`;
    for (let i = 0; i < 10; i += 1) {
      const { user } = await signedIn();
      const cat = await createTestCategory(user.id, { name: i < 7 ? 'Food' : 'Snacks' });
      await MerchantCategoryRule.create({ userId: user.id, merchant, categoryId: cat.id });
      if (i === 8) expect((await listAliasCandidates()).some((c) => c.aliasKey === merchant)).toBe(false);
    }
    const res = await call(admin, adminToken, 'GET', '/admin/detection/alias-candidates');
    expect(res.body.data.find((c: any) => c.aliasKey === merchant)).toEqual({ aliasKey: merchant, users: 10, suggestedCategory: 'food' });
  });

  it('a personal rule beats the knowledge-base category (T7.5, spec rule 8)', async () => {
    const { user } = await signedIn();
    const kb = await createTestCategory(user.id, { name: 'Shopping' });
    const mine = await createTestCategory(user.id, { name: 'Gifts' });
    await MerchantCategoryRule.create({ userId: user.id, merchant: 'croma', categoryId: mine.id });
    const res = await syncBatch(user.id, { items: [item(user.id, { merchantName: 'Croma', categoryId: kb.id, categorySource: 'knowledge_base' })] });
    expect((await DetectedTransaction.findByPk(res.results[0]!.detectedId!))?.categoryId).toBe(mine.id);
  });

  it('exports detection data, and account deletion leaves no detection rows (T7.6)', async () => {
    const { user, token } = await signedIn({ detectionTemplateLearning: true });
    const cat = await createTestCategory(user.id, { name: 'Food' });
    await syncBatch(user.id, { items: [item(user.id)] });
    await MerchantCategoryRule.create({ userId: user.id, merchant: 'zomato', categoryId: cat.id });
    await call(mobile, token, 'POST', '/detected-transactions/diagnostics', {
      rows: [{ day: today, stage: 'INELIGIBLE', reasonCode: 'otp_marker', institutionId: null, count: 1 }],
    });
    await call(mobile, token, 'POST', '/detected-transactions/skeletons', {
      items: [{ skeletonHash: 'a'.repeat(64), skeleton: SKELETON, institutionId: null, senderKey: 'X', country: null, language: null, correctedField: null }],
    });

    const exported = await call(mobile, token, 'GET', '/detected-transactions/me/export');
    expect(exported.body.data).toMatchObject({ settings: { templateLearning: true } });
    expect(exported.body.data.detectedTransactions).toHaveLength(1);
    expect(exported.body.data.merchantRules).toHaveLength(1);
    expect(exported.body.data.diagnostics).toHaveLength(1);
    expect(exported.body.data.templateLearningSubmissions).toHaveLength(1);

    await deleteUserAccount(user.id);
    const counts = await sequelize.query<{ t: string; n: string }>(
      `SELECT 'detected' AS t, count(*) AS n FROM detected_transactions WHERE user_id = :id
       UNION ALL SELECT 'rules', count(*) FROM merchant_category_rules WHERE user_id = :id
       UNION ALL SELECT 'diagnostics', count(*) FROM detection_diagnostics_daily WHERE user_id = :id
       UNION ALL SELECT 'skeletons', count(*) FROM detection_skeleton_submissions WHERE user_hash = :hash`,
      { type: QueryTypes.SELECT, replacements: { id: user.id, hash: userHash(user.id) } }
    );
    expect(counts.map((c) => [c.t, Number(c.n)])).toEqual([
      ['detected', 0],
      ['rules', 0],
      ['diagnostics', 0],
      ['skeletons', 0],
    ]);
    expect(await User.findByPk(user.id)).toBeNull();
  });

  it('retention removes old rejected detections and old diagnostics only (T7.6)', async () => {
    const { user } = await signedIn();
    const res = await syncBatch(user.id, { items: [item(user.id), item(user.id)] });
    const [oldRejected, kept] = res.results.map((r) => r.detectedId!);
    await sequelize.query(`UPDATE detected_transactions SET status = 'rejected', created_transaction_id = NULL, updated_at = NOW() - interval '100 days' WHERE id = :id`, {
      replacements: { id: oldRejected },
    });
    await sequelize.query(
      `INSERT INTO detection_diagnostics_daily (user_id, day, stage, reason_code, institution_id, count)
       VALUES (:u, CAST(:old AS date), 'INELIGIBLE', 'otp_marker', '', 1), (:u, CAST(:recent AS date), 'INELIGIBLE', 'otp_marker', '', 1)`,
      { replacements: { u: user.id, old: daysAgo(200), recent: daysAgo(10) } }
    );
    await runDetectionRetention();
    expect(await DetectedTransaction.findByPk(oldRejected)).toBeNull();
    expect(await DetectedTransaction.findByPk(kept)).not.toBeNull();
    const [{ n }] = await sequelize.query<{ n: string }>(`SELECT count(*) AS n FROM detection_diagnostics_daily WHERE user_id = :u`, {
      type: QueryTypes.SELECT,
      replacements: { u: user.id },
    });
    expect(Number(n)).toBe(1);
  });

  it('audits automatic adds and deletions, and shows them to admins (T7.6, T7.7)', async () => {
    const { user, token } = await signedIn();
    await syncBatch(user.id, { items: [item(user.id)] });
    expect(await AuditLog.count({ where: { action: 'detection.auto_create', resourceId: user.id } })).toBe(1);
    await call(mobile, token, 'DELETE', '/detected-transactions/me');
    const deletions = await call(admin, adminToken, 'GET', '/admin/detection/deletions');
    expect(deletions.body.data.some((d: any) => d.userId === user.id && d.action === 'detection.delete_all')).toBe(true);
    const audit = await call(admin, adminToken, 'GET', '/admin/audit-logs?action=detection.auto_create&limit=50');
    expect(audit.status).toBe(200);
  });
});
