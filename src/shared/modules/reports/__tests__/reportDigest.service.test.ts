import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import * as reportService from '../service/report.service';
import { sendMonthlyReportDigests } from '../service/reportDigest.service';
import { emailQueue } from '@queue/queues';

/**
 * These tests run against the real dev Postgres, whose `users` table is shared with
 * every other test file and any concurrently-running process — so assertions are scoped
 * to the specific user(s) each test creates rather than global counts, which would be
 * flaky against pre-existing or concurrently-created opted-in rows.
 *
 * sendMonthlyReportDigests enqueues onto the real emailQueue (Redis-backed BullMQ) rather
 * than calling sendMonthlyReportEmail directly — no worker runs in this test environment,
 * so jobs land in 'waiting' and are inspected there, matching the same enqueue-and-inspect
 * pattern used for the report-export queue elsewhere in this suite.
 */
describe('sendMonthlyReportDigests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await emailQueue.close();
  });

  async function findJobFor(email: string) {
    const jobs = await emailQueue.getJobs(['waiting', 'active', 'completed', 'delayed']);
    return jobs.find((j) => j.data.kind === 'monthly_digest' && j.data.to === email);
  }

  it('enqueues a monthly_digest job with an Excel attachment for an opted-in user', async () => {
    const optedIn = await createTestUser({ monthlyDigestOptIn: true });
    await createTestTransaction(optedIn.id, { type: 'expense', amount: 500 });

    await sendMonthlyReportDigests();

    const job = await findJobFor(optedIn.email);
    expect(job).toBeDefined();

    const { payload } = job!.data;
    expect(typeof payload.periodLabel).toBe('string');
    expect(payload.periodLabel!.length).toBeGreaterThan(0);
    expect(payload.attachmentFilename).toMatch(/\.xlsx$/);
    expect(payload.attachmentBase64).toBeTruthy();
    expect(Buffer.from(payload.attachmentBase64!, 'base64').length).toBeGreaterThan(0);
  });

  it('never enqueues a digest for a user who has not opted in', async () => {
    const notOptedIn = await createTestUser({ monthlyDigestOptIn: false });

    await sendMonthlyReportDigests();

    const job = await findJobFor(notOptedIn.email);
    expect(job).toBeUndefined();
  });

  it('continues processing remaining users if one user errors, reporting per-user outcomes', async () => {
    const failing = await createTestUser({ monthlyDigestOptIn: true });
    const succeeding = await createTestUser({ monthlyDigestOptIn: true });

    vi.spyOn(reportService, 'generateExcelReport').mockImplementation(async (userId) => {
      if (userId === failing.id) throw new Error('report generation failed');
      return Buffer.from('fake-xlsx-content');
    });

    const result = await sendMonthlyReportDigests();

    // At minimum this test's own 2 users must have been attempted — one failed, one succeeded.
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const succeededJob = await findJobFor(succeeding.email);
    expect(succeededJob).toBeDefined();
    const failedJob = await findJobFor(failing.email);
    expect(failedJob).toBeUndefined();
  });
});
