import { describe, it, expect, beforeAll } from 'vitest';
import { LoanPayment } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createLoan, payLoan } from '../loans.service';

describe('payLoan overpayment clamp', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('records only the remaining balance when the payment exceeds it', async () => {
    const user = await createTestUser();
    const loan = await createLoan(user.id, {
      name: 'Overpay Loan',
      type: 'loan',
      principal: 200,
      startDate: new Date().toISOString().slice(0, 10),
    });

    const { payment } = await payLoan(user.id, loan.id, 500);
    expect(Number(payment.amount)).toBe(200);

    const rows = await LoanPayment.findAll({ where: { loanId: loan.id } });
    const totalRecorded = rows.reduce((sum, row) => sum + Number(row.amount), 0);
    expect(totalRecorded).toBe(200);
  });
});
