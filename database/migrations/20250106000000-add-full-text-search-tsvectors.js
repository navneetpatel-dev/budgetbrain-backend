'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Transactions FTS generated column + GIN index
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'transactions' AND column_name = 'fts'
        ) THEN
          ALTER TABLE transactions
          ADD COLUMN fts tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english', coalesce(merchant, '') || ' ' || coalesce(notes, ''))
          ) STORED;
        END IF;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS transactions_fts_idx ON transactions USING GIN (fts);
    `);

    // 2. Categories FTS generated column + GIN index
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'categories' AND column_name = 'fts'
        ) THEN
          ALTER TABLE categories
          ADD COLUMN fts tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english', coalesce(name, ''))
          ) STORED;
        END IF;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS categories_fts_idx ON categories USING GIN (fts);
    `);

    // 3. Income Sources FTS generated column + GIN index
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'income_sources' AND column_name = 'fts'
        ) THEN
          ALTER TABLE income_sources
          ADD COLUMN fts tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english', coalesce(name, ''))
          ) STORED;
        END IF;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS income_sources_fts_idx ON income_sources USING GIN (fts);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS transactions_fts_idx;
      ALTER TABLE transactions DROP COLUMN IF EXISTS fts;
      DROP INDEX IF EXISTS categories_fts_idx;
      ALTER TABLE categories DROP COLUMN IF EXISTS fts;
      DROP INDEX IF EXISTS income_sources_fts_idx;
      ALTER TABLE income_sources DROP COLUMN IF EXISTS fts;
    `);
  },
};
