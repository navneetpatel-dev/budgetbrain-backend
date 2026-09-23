'use strict';

// The admin dashboard filters/sorts users by created_at, last_login_at, and role on every
// load (getAdminDashboard) with no supporting index — and support_tickets had no index at
// all, not even on its user_id foreign key, despite being filtered by status and joined to
// users on every admin ticket-list load.
module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`CREATE INDEX IF NOT EXISTS users_created_at_idx ON "users" (created_at)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS users_last_login_at_idx ON "users" (last_login_at)`);
    await sequelize.query(`CREATE INDEX IF NOT EXISTS users_role_idx ON "users" (role)`);
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON "support_tickets" (user_id)`
    );
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON "support_tickets" (status)`
    );
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`DROP INDEX IF EXISTS users_created_at_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS users_last_login_at_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS users_role_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS support_tickets_user_id_idx`).catch(() => {});
    await sequelize.query(`DROP INDEX IF EXISTS support_tickets_status_idx`).catch(() => {});
  },
};
