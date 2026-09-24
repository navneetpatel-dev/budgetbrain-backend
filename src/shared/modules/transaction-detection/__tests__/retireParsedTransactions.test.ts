import { describe, it, expect, beforeAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import { DetectedTransaction, ParsedTransaction, sequelize } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const migration = require('../../../../../database/migrations/20260927000000-retire-parsed-transactions.js') as {
  up: (qi: unknown) => Promise<void>;
  down: (qi: unknown) => Promise<void>;
};

/** Plan T6.3: pending legacy items move to review, and no stored message text survives. */
describe('retire parsed_transactions migration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('moves pending rows to review, erases every message text, and is safe to run twice', async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const pending = await ParsedTransaction.create({
      userId: user.id,
      source: 'sms',
      type: 'expense',
      rawContent: 'Rs 250 debited at SWIGGY. Avl bal 9000 ZQXV-RAW-1',
      parsedAmount: 250,
      parsedMerchant: 'SWIGGY',
      parsedDate: new Date('2026-09-20'),
      confidence: 0.4,
    });
    await ParsedTransaction.create({
      userId: user.id,
      source: 'email',
      type: 'income',
      rawContent: 'Salary credited ZQXV-RAW-2',
      parsedAmount: 50000,
      parsedMerchant: 'ACME',
      parsedDate: null,
      confidence: 0.9,
      status: 'confirmed',
    });
    await ParsedTransaction.create({
      userId: other.id,
      source: 'csv',
      type: 'expense',
      rawContent: '2026-09-01,No amount,,ZQXV-RAW-3',
      parsedAmount: null,
      parsedMerchant: null,
      parsedDate: null,
      confidence: 0,
    });

    const qi = sequelize.getQueryInterface();
    await migration.up(qi);
    await migration.up(qi);

    // Only the pending row with an amount moved, once, as a low-confidence review item.
    const moved = await DetectedTransaction.findAll({ where: { userId: user.id } });
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({
      status: 'pending_review',
      reviewReason: 'legacy_import',
      source: 'pasted_sms',
      direction: 'DEBIT',
      transactionType: 'expense',
      merchant: 'SWIGGY',
      dedupFingerprint: `legacy_${pending.id}`,
    });
    expect(Number(moved[0]!.amount)).toBe(250);
    expect(await DetectedTransaction.count({ where: { userId: other.id } })).toBe(0);

    // No message text is left anywhere in the table.
    const [{ n }] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM parsed_transactions WHERE raw_content IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );
    expect(Number(n)).toBe(0);
    const [{ hits }] = await sequelize.query<{ hits: string }>(
      `SELECT count(*) AS hits FROM parsed_transactions WHERE parsed_merchant LIKE 'ZQXV%' OR raw_content LIKE '%ZQXV%'`,
      { type: QueryTypes.SELECT }
    );
    expect(Number(hits)).toBe(0);

    // Down removes only the moved review items; the erased text stays erased.
    await migration.down(qi);
    expect(await DetectedTransaction.count({ where: { userId: user.id } })).toBe(0);
    expect((await ParsedTransaction.findByPk(pending.id))?.rawContent).toBeNull();
  });
});
