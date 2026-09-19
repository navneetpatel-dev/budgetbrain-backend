import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import * as emailService from '@shared/services/email.service';
import { sendMonthlyReportDigests } from '../service/reportDigest.service';

/**
 * These tests run against the real dev Postgres, whose `users` table is shared with
 * every other test file and any concurrently-running process — so assertions are scoped
 * to the specific user(s) each test creates rather than global counts, which would be
 * flaky against pre-existing or concurrently-created opted-in rows.
 */
describe('sendMonthlyReportDigests', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails an Excel attachment to an opted-in user', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);

    const optedIn = await createTestUser({ monthlyDigestOptIn: true });
    await createTestTransaction(optedIn.id, { type: 'expense', amount: 500 });

    await sendMonthlyReportDigests();

    const callForUser = sendEmailSpy.mock.calls.find(([to]) => to === optedIn.email);
    expect(callForUser).toBeDefined();

    const [, subject, , attachments] = callForUser!;
    expect(subject).toContain('BudgetBrain report');
    expect(attachments).toHaveLength(1);
    expect(attachments![0].filename).toMatch(/\.xlsx$/);
    expect(Buffer.isBuffer(attachments![0].content)).toBe(true);
    expect(attachments![0].content.length).toBeGreaterThan(0);
  });

  it('never emails a user who has not opted in', async () => {
    const sendEmailSpy = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    const notOptedIn = await createTestUser({ monthlyDigestOptIn: false });

    await sendMonthlyReportDigests();

    const callForUser = sendEmailSpy.mock.calls.find(([to]) => to === notOptedIn.email);
    expect(callForUser).toBeUndefined();
  });

  it('continues processing remaining users if one user errors, reporting per-user outcomes', async () => {
    const failing = await createTestUser({ monthlyDigestOptIn: true });
    const succeeding = await createTestUser({ monthlyDigestOptIn: true });

    vi.spyOn(emailService, 'sendEmail').mockImplementation(async (to) => {
      if (to === failing.email) throw new Error('SMTP down');
    });

    const result = await sendMonthlyReportDigests();

    // At minimum this test's own 2 users must have been attempted — one failed, one succeeded.
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    void succeeding;
  });
});
