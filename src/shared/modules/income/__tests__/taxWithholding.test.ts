import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createIncome, updateIncome } from '../income.service';
import { IncomeSource } from '@database/models';

describe('Income tax withholding — server-computed netAmount', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  async function makeSource(userId: string) {
    return IncomeSource.create({ userId, name: 'Salary', type: 'salary' } as any);
  }

  it('computes netAmount from amount - taxWithheld on create', async () => {
    const user = await createTestUser();
    const source = await makeSource(user.id);

    const income = await createIncome(user.id, {
      amount: 10000,
      incomeSourceId: source.id,
      date: new Date().toISOString().slice(0, 10),
      taxWithheld: 1500,
    } as any);

    expect(Number(income!.taxWithheld)).toBe(1500);
    expect(Number(income!.netAmount)).toBe(8500);
  });

  it('leaves taxWithheld/netAmount null when not supplied', async () => {
    const user = await createTestUser();
    const source = await makeSource(user.id);

    const income = await createIncome(user.id, {
      amount: 5000,
      incomeSourceId: source.id,
      date: new Date().toISOString().slice(0, 10),
    } as any);

    expect(income!.taxWithheld).toBeNull();
    expect(income!.netAmount).toBeNull();
  });

  it('recomputes netAmount on update when taxWithheld changes', async () => {
    const user = await createTestUser();
    const source = await makeSource(user.id);

    const income = await createIncome(user.id, {
      amount: 10000,
      incomeSourceId: source.id,
      date: new Date().toISOString().slice(0, 10),
      taxWithheld: 1000,
    } as any);

    const updated = await updateIncome(user.id, income!.id, { taxWithheld: 2000 } as any);
    expect(Number(updated.netAmount)).toBe(8000);
  });

  it('keeps netAmount consistent when amount changes without an explicit taxWithheld update', async () => {
    const user = await createTestUser();
    const source = await makeSource(user.id);

    const income = await createIncome(user.id, {
      amount: 10000,
      incomeSourceId: source.id,
      date: new Date().toISOString().slice(0, 10),
      taxWithheld: 1000,
    } as any);

    const updated = await updateIncome(user.id, income!.id, { amount: 12000 } as any);
    expect(Number(updated.taxWithheld)).toBe(1000);
    expect(Number(updated.netAmount)).toBe(11000);
  });

  it('rejects a client-supplied netAmount — the field is never accepted as input', async () => {
    const user = await createTestUser();
    const source = await makeSource(user.id);

    const income = await createIncome(user.id, {
      amount: 10000,
      incomeSourceId: source.id,
      date: new Date().toISOString().slice(0, 10),
      taxWithheld: 1000,
      netAmount: 1, // must be ignored — server always derives it
    } as any);

    expect(Number(income!.netAmount)).toBe(9000);
  });
});
