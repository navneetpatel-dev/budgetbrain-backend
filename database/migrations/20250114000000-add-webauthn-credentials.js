'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    if (dialect === 'postgres') {
      // ALTER TYPE ... ADD VALUE must run as its own statement, matching the pattern in
      // 20250103000000-add-additive-columns-and-enums.js.
      try {
        await sequelize.query(
          `ALTER TYPE "enum_verification_tokens_type" ADD VALUE IF NOT EXISTS 'webauthn_challenge'`
        );
      } catch {}
    }

    // Initial schema uses sequelize.sync() against current models, so a fresh CI
    // database already has this table before this migration runs.
    const existing = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'webauthn_credentials'
       ) AS exists`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (existing[0]?.exists) return;

    await queryInterface.createTable('webauthn_credentials', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      credential_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      counter: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      transports: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      device_label: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('webauthn_credentials', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('webauthn_credentials');
    // Postgres does not support removing an ENUM value; left as a no-op like sibling migrations.
  },
};
