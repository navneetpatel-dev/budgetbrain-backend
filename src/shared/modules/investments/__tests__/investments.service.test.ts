import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createInvestment, listInvestments, updateInvestment } from '../investments.service';
import { AppError } from '@shared/errors';

describe('investments.service', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('creates an investment and returns enriched currentValue and gainLoss on list', async () => {
    const user = await createTestUser();
    const inv = await createInvestment(user.id, {
      name: 'NIFTY 50 ETF',
      type: 'mutual_fund',
      quantity: 10,
      purchasePrice: 200,
      currentPrice: 250,
      purchaseDate: '2026-01-15',
      currency: 'INR',
    });

    expect(inv.id).toBeDefined();

    const list = await listInvestments(user.id);
    expect(list.investments).toHaveLength(1);
    expect(list.investments[0].currentValue).toBe(2500); // 10 * 250
    expect(list.investments[0].gainLoss).toBe(500); // 2500 - 2000
  });

  it('updates an investment price and details', async () => {
    const user = await createTestUser();
    const inv = await createInvestment(user.id, {
      name: 'Tesla',
      type: 'stocks',
      quantity: 5,
      purchasePrice: 150,
      currentPrice: 150,
      purchaseDate: '2026-02-01',
      currency: 'USD',
    });

    const updated = await updateInvestment(user.id, inv.id, {
      currentPrice: 200,
    });

    expect(Number(updated.currentPrice)).toBe(200);

    const list = await listInvestments(user.id);
    expect(list.investments[0].gainLoss).toBe(250); // (200 - 150) * 5
  });

  it('throws 404 when updating non-existent investment', async () => {
    const user = await createTestUser();
    await expect(
      updateInvestment(user.id, '00000000-0000-0000-0000-000000000000', { currentPrice: 100 })
    ).rejects.toThrow(AppError);
  });
});
