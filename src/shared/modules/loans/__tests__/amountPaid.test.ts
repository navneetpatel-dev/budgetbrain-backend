import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createLoan, getLoan, payLoan } from '../loans.service';

describe('Loan.amountPaid / paidPercentage — server-computed virtual fields', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('starts at 0 paid / 0% when remainingBalance equals principal', async () => {
    const user = await createTestUser();
    const loan = await createLoan(user.id, {
      name: 'Car Loan',
      type: 'loan',
      principal: 100000,
      startDate: new Date().toISOString().slice(0, 10),
    });

    expect(loan.amountPaid).toBe(0);
    expect(loan.paidPercentage).toBe(0);
  });

  it('reflects principal - remainingBalance after a payment, rounded percentage', async () => {
    const user = await createTestUser();
    const loan = await createLoan(user.id, {
      name: 'Personal Loan',
      type: 'loan',
      principal: 1000,
      startDate: new Date().toISOString().slice(0, 10),
    });

    await payLoan(user.id, loan.id, 250);

    const updated = await getLoan(user.id, loan.id);
    expect(updated.amountPaid).toBe(250);
    expect(updated.paidPercentage).toBe(25);
  });

  it('caps paidPercentage at 100 and floors amountPaid at 0 (never negative/over)', async () => {
    const user = await createTestUser();
    const loan = await createLoan(user.id, {
      name: 'Small Loan',
      type: 'loan',
      principal: 100,
      startDate: new Date().toISOString().slice(0, 10),
    });

    await payLoan(user.id, loan.id, 100);

    const updated = await getLoan(user.id, loan.id);
    expect(updated.amountPaid).toBe(100);
    expect(updated.paidPercentage).toBe(100);
  });
});
