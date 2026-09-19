import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { generatePdfReport } from '../service/pdf.service';

describe('generatePdfReport', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('produces a non-empty buffer starting with the %PDF magic bytes', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { amount: 10 });

    const buffer = await generatePdfReport(user.id, {});
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('does not throw for a user with zero matching transactions', async () => {
    const user = await createTestUser();
    const buffer = await generatePdfReport(user.id, {});
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('accepts the legacy (startDate, endDate) positional-argument call shape', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { amount: 5, date: new Date('2024-01-01') });

    const buffer = await generatePdfReport(user.id, '2024-01-01', '2024-01-31');
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });

  it('paginates across many rows without throwing', async () => {
    const user = await createTestUser();
    for (let i = 0; i < 40; i += 1) {
      await createTestTransaction(user.id, { amount: 1 + i, merchant: `Merchant ${i}` });
    }

    const buffer = await generatePdfReport(user.id, {});
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
});
