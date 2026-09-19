'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    // pg_trgm can fail to create without superuser privileges on some managed
    // Postgres providers — degrade gracefully rather than block all other
    // migrations in this batch from applying.
    try {
      await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    } catch (err) {
      console.warn(
        '[migration] Could not create pg_trgm extension (may require superuser). ' +
          'Typo-tolerant merchant search will be unavailable until this extension exists. ' +
          `Error: ${err.message}`
      );
      return;
    }

    try {
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_merchant_trgm
        ON transactions USING gin (merchant gin_trgm_ops);
      `);
    } catch (err) {
      console.warn(`[migration] Could not create merchant trigram index: ${err.message}`);
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();
    if (dialect !== 'postgres') return;

    await sequelize.query(`DROP INDEX IF EXISTS idx_transactions_merchant_trgm;`).catch(() => {});
    // Extension is left in place on down — other features/extensions may depend on it,
    // and DROP EXTENSION would fail if so; not worth the risk for a reversible-migration nicety.
  },
};
