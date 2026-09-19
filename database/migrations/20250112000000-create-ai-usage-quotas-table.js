'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const rows = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'ai_usage_quotas'
       ) AS exists`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    if (rows[0]?.exists) return;

    await queryInterface.createTable('ai_usage_quotas', {
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
      period_month: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      tokens_used: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex('ai_usage_quotas', ['user_id', 'period_month'], {
      unique: true,
      name: 'ai_usage_quotas_user_id_period_month_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_usage_quotas');
  },
};
