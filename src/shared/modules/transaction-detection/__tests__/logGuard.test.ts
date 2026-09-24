import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import Transport from 'winston-transport';
import { generateAccessToken } from '@core/auth/jwt';
import { redis } from '@core/cache/redis.client';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createLogger } from '@shared/logging';
import { __rootLoggerForTests } from '@shared/logging/logger';
import webApp from '../../../../web/app';
import { __resetServerPackForTests } from '@modules/knowledge-base/serverPack.service';

/**
 * Plan T9.4 (P1): no message body reaches the logs, whatever the request does. Every line any
 * logger writes during these requests is captured after the logger's own formatting.
 */
class Capture extends Transport {
  lines: string[] = [];
  override log(info: unknown, next: () => void) {
    this.lines.push(JSON.stringify(info));
    next();
  }
}

let server: Server;
let base: string;
const capture = new Capture();

beforeAll(async () => {
  await setupTestDb();
  __resetServerPackForTests();
  const limited = await redis.keys('rl:ingest:*');
  if (limited.length > 0) await redis.del(...limited);
  __rootLoggerForTests().add(capture);
  server = await new Promise<Server>((resolve) => {
    const s = webApp.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

afterAll(async () => {
  __rootLoggerForTests().remove(capture);
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  capture.lines = [];
});

async function token() {
  const user = await createTestUser();
  return generateAccessToken({ userId: user.id, email: user.email, role: user.role });
}

describe('no message text in logs (T9.4)', () => {
  it('keeps a pasted SMS out of every log line', async () => {
    const marker = `LOGLEAK${Date.now()}`;
    const res = await fetch(`${base}/detected-transactions/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'sms', sender: 'VM-HDFCBK', text: `Rs.99.00 debited from a/c **1234 Ref ${marker}` }),
    });
    expect(res.status).toBe(200);
    expect(capture.lines.join('\n')).not.toContain(marker);
  });

  it('answers malformed JSON with 400 and neither logs nor echoes the body', async () => {
    const marker = `LOGLEAKJSON${Date.now()}`;
    const res = await fetch(`${base}/detected-transactions/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: `Rs 250 debited ${marker} {not json`,
    });
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(JSON.parse(body).error.code).toBe('INVALID_JSON');
    expect(body).not.toContain(marker);
    expect(capture.lines.join('\n')).not.toContain(marker);
  });

  it('scrubs a body that code logs by mistake', async () => {
    const marker = `LOGLEAKMETA${Date.now()}`;
    createLogger('web').error('Something failed', { body: { text: marker }, note: `${'x'.repeat(400)}${marker}` });
    expect(capture.lines).toHaveLength(1);
    expect(capture.lines[0]).not.toContain(marker);
    expect(capture.lines[0]).toContain('Something failed');
  });
});
