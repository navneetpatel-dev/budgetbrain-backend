'use strict';

// refresh_tokens had zero indexes despite token_hash being looked up on every
// token-refresh request (an auth hot path) — a full table scan on a table that grows
// with every login. family_groups' owner_id (used for ownership checks) was likewise
// unindexed.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON "refresh_tokens" (token_hash)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON "refresh_tokens" (user_id)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS family_groups_owner_id_idx ON "family_groups" (owner_id)`
    );
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP INDEX IF EXISTS refresh_tokens_token_hash_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS refresh_tokens_user_id_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS family_groups_owner_id_idx`).catch(() => {});
  },
};
