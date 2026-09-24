import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { QueryTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import { sequelize } from '@database/models';
import { generateAccessToken } from '@core/auth/jwt';
import { deleteCache } from '@core/cache/cache.service';
import { setupTestDb, createTestUser } from '@testHelpers';
import adminApp from '../../../../admin/app';
import mobileApp from '../../../../mobile/app';
import { resolveRollout, rolloutBucket } from '../rollout.service';

/**
 * Staged rollout (plan T9.3). Only the test country `ZZ` is written, so parallel test files
 * whose users have no country keep detection on.
 */
const servers: Server[] = [];
async function listen(app: typeof adminApp): Promise<string> {
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
}
async function call(base: string, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
}
const tokenFor = (u: { id: string; email: string; role: string }) => generateAccessToken({ userId: u.id, email: u.email, role: u.role as never });

let admin: string;
let mobile: string;
let adminToken: string;

beforeAll(async () => {
  await setupTestDb();
  await sequelize.query(`DELETE FROM detection_rollout WHERE country = 'ZZ'`);
  await deleteCache('detection:rollout');
  admin = await listen(adminApp);
  mobile = await listen(mobileApp);
  const staff = await createTestUser({ role: 'admin' } as never);
  adminToken = tokenFor(staff);
});

afterAll(async () => {
  await sequelize.query(`DELETE FROM detection_rollout WHERE country = 'ZZ'`);
  await deleteCache('detection:rollout');
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
});

describe('rollout decision', () => {
  const ids = Array.from({ length: 4000 }, () => randomUUID());

  it('buckets users stably and evenly, so raising the percentage only adds users', () => {
    expect(rolloutBucket(ids[0]!)).toBe(rolloutBucket(ids[0]!));
    const inAt = (percent: number) => new Set(ids.filter((id) => resolveRollout([{ country: '', percent, includeInternal: false }], { id })));
    const five = inAt(5);
    const quarter = inAt(25);
    expect(five.size / ids.length).toBeGreaterThan(0.03);
    expect(five.size / ids.length).toBeLessThan(0.07);
    expect(quarter.size / ids.length).toBeGreaterThan(0.22);
    expect(quarter.size / ids.length).toBeLessThan(0.28);
    expect([...five].every((id) => quarter.has(id))).toBe(true);
    expect(inAt(100).size).toBe(ids.length);
    expect(inAt(0).size).toBe(0);
  });

  it('uses the country row, else the default row, else lets everyone in; internal stage is admins', () => {
    const rows = [
      { country: '', percent: 0, includeInternal: true },
      { country: 'IN', percent: 100, includeInternal: true },
    ];
    expect(resolveRollout([], { id: ids[0]! })).toBe(true);
    expect(resolveRollout(rows, { id: ids[0]!, country: ' in ' })).toBe(true);
    expect(resolveRollout(rows, { id: ids[0]!, country: 'US' })).toBe(false);
    expect(resolveRollout(rows, { id: ids[0]!, country: null })).toBe(false);
    expect(resolveRollout(rows, { id: ids[0]!, country: 'US', role: 'admin' })).toBe(true);
    expect(resolveRollout([{ country: '', percent: 0, includeInternal: false }], { id: ids[0]!, role: 'admin' })).toBe(false);
  });
});

describe('rollout over HTTP (admin console → app config)', () => {
  it('turns detection off outside the rollout, keeps admins in at the internal stage, and audits each change', async () => {
    const user = await createTestUser({ country: 'ZZ' } as never);
    const staff = await createTestUser({ country: 'ZZ', role: 'admin' } as never);
    const config = async (u: typeof user) => (await call(mobile, tokenFor(u), 'GET', '/detected-transactions/config')).body.data;
    expect(await config(user)).toMatchObject({ enabled: true, rolledOut: true });

    // Internal stage: 0 % plus admins.
    const set = await call(admin, adminToken, 'PUT', '/admin/detection/rollout/ZZ', { percent: 0, note: 'internal only' });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ country: 'ZZ', percent: 0, includeInternal: true, note: 'internal only' });
    expect(await config(user)).toMatchObject({ enabled: false, rolledOut: false });
    expect(await config(staff)).toMatchObject({ enabled: true, rolledOut: true });

    // 100 %, then removing the row: everyone again.
    await call(admin, adminToken, 'PUT', '/admin/detection/rollout/ZZ', { percent: 100 });
    expect(await config(user)).toMatchObject({ enabled: true });
    await call(admin, adminToken, 'PUT', '/admin/detection/rollout/ZZ', { percent: 0, includeInternal: false });
    expect(await config(staff)).toMatchObject({ enabled: false });
    expect((await call(admin, adminToken, 'DELETE', '/admin/detection/rollout/ZZ')).body.data).toEqual({ deleted: true });
    expect(await config(user)).toMatchObject({ enabled: true });

    const [{ n }] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_logs WHERE action = 'kb.rollout_change' AND metadata->>'country' = 'ZZ'`,
      { type: QueryTypes.SELECT }
    );
    expect(Number(n)).toBeGreaterThanOrEqual(4);

    expect((await call(admin, adminToken, 'PUT', '/admin/detection/rollout/zz', { percent: 5 })).status).toBe(400);
    expect((await call(admin, adminToken, 'PUT', '/admin/detection/rollout/ZZ', { percent: 101 })).status).toBe(400);
    expect((await call(admin, tokenFor(user), 'GET', '/admin/detection/rollout')).status).toBe(403);
  });
});
