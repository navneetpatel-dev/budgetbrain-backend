import { describe, it, expect, beforeAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import { DetectedTransaction, sequelize } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';

interface Migration {
  up: (qi: unknown) => Promise<void>;
  down: (qi: unknown) => Promise<void>;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const retire = require('../../../../../database/migrations/20260927000000-retire-parsed-transactions.js') as Migration;
const drop = require('../../../../../database/migrations/20260929000000-drop-parsed-transactions.js') as Migration;
/* eslint-enable @typescript-eslint/no-require-imports */

const tableExists = async () => {
  const [row] = await sequelize.query<{ t: string | null }>(`SELECT to_regclass('public.parsed_transactions')::text AS t`, {
    type: QueryTypes.SELECT,
  });
  return row?.t !== null;
};

async function insertParsed(values: {
  userId: string;
  source: string;
  type: string;
  raw: string;
  amount: number | null;
  merchant: string | null;
  status?: string;
}): Promise<string> {
  const [row] = await sequelize.query<{ id: string }>(
    `INSERT INTO parsed_transactions (id, user_id, source, type, raw_content, parsed_amount, parsed_merchant, parsed_date,
       confidence, status, created_at, updated_at)
     VALUES (gen_random_uuid(), :userId, CAST(:source AS enum_parsed_transactions_source), :type, :raw, :amount, :merchant,
       NULL, 0.4, CAST(:status AS enum_parsed_transactions_status), NOW(), NOW())
     RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { status: 'pending', ...values } }
  );
  return row!.id;
}

/** Plan T6.3: the legacy staging table is emptied of text, then dropped. */
describe('parsed_transactions retirement migrations', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('is gone after migrating, and dropping it again is a no-op', async () => {
    const qi = sequelize.getQueryInterface();
    expect(await tableExists()).toBe(false);
    await drop.up(qi);
    expect(await tableExists()).toBe(false);
  });

  it('retire moves pending rows to review and erases all text; drop removes the table (down recreates it empty)', async () => {
    const qi = sequelize.getQueryInterface();
    await drop.down(qi);
    expect(await tableExists()).toBe(true);
    try {
      const user = await createTestUser();
      const other = await createTestUser();
      const pending = await insertParsed({ userId: user.id, source: 'sms', type: 'expense', raw: 'Rs 250 debited at SWIGGY ZQXV-RAW-1', amount: 250, merchant: 'SWIGGY' });
      await insertParsed({ userId: user.id, source: 'email', type: 'income', raw: 'Salary ZQXV-RAW-2', amount: 50000, merchant: 'ACME', status: 'confirmed' });
      await insertParsed({ userId: other.id, source: 'csv', type: 'expense', raw: 'No amount ZQXV-RAW-3', amount: null, merchant: null });

      await retire.up(qi);
      await retire.up(qi);

      const moved = await DetectedTransaction.findAll({ where: { userId: user.id } });
      expect(moved).toHaveLength(1);
      expect(moved[0]).toMatchObject({
        status: 'pending_review',
        reviewReason: 'legacy_import',
        source: 'pasted_sms',
        direction: 'DEBIT',
        transactionType: 'expense',
        merchant: 'SWIGGY',
        dedupFingerprint: `legacy_${pending}`,
      });
      expect(Number(moved[0]!.amount)).toBe(250);
      expect(await DetectedTransaction.count({ where: { userId: other.id } })).toBe(0);
      const [{ n }] = await sequelize.query<{ n: string }>(
        `SELECT count(*) AS n FROM parsed_transactions WHERE raw_content IS NOT NULL`,
        { type: QueryTypes.SELECT }
      );
      expect(Number(n)).toBe(0);

      // Retire's down removes only the moved review items.
      await retire.down(qi);
      expect(await DetectedTransaction.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      await drop.up(qi);
    }
    expect(await tableExists()).toBe(false);
    const [types] = await sequelize.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_type WHERE typname IN ('enum_parsed_transactions_source', 'enum_parsed_transactions_status')`,
      { type: QueryTypes.SELECT }
    );
    expect(Number(types!.n)).toBe(0);
  });
});
