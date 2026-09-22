'use strict';

// recurringSeries.service.ts historically did a findOne-then-create (non-atomic) on
// (user_id, merchant), so duplicate rows may already exist — dedup first, same pattern
// as 20260921120000-budget-alert-period-unique.js and 20260921120001-device-push-token-unique.js.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      DELETE FROM recurring_series a
      USING recurring_series b
      WHERE a.user_id = b.user_id
        AND a.merchant = b.merchant
        AND a.id <> b.id
        AND a.updated_at < b.updated_at
    `);
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS recurring_series_user_merchant_unique
      ON "recurring_series" (user_id, merchant)
    `);
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS recurring_series_user_id_idx ON "recurring_series" (user_id)`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize
      .query(`DROP INDEX IF EXISTS recurring_series_user_merchant_unique`)
      .catch(() => {});
    await queryInterface.sequelize
      .query(`DROP INDEX IF EXISTS recurring_series_user_id_idx`)
      .catch(() => {});
  },
};
