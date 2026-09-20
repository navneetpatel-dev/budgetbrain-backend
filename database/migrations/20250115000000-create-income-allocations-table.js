'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    const [tableExists] = await sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'income_allocations'
       ) AS exists`
    );
    if (tableExists[0]?.exists) return;

    await queryInterface.createTable('income_allocations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: dialect === 'postgres' ? Sequelize.literal('gen_random_uuid()') : Sequelize.UUIDV4,
        primaryKey: true,
      },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'transactions', key: 'id' },
        onDelete: 'CASCADE',
      },
      financial_account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'financial_accounts', key: 'id' },
        onDelete: 'CASCADE',
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('income_allocations', ['transaction_id']);
    await queryInterface.addIndex('income_allocations', ['financial_account_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('income_allocations').catch(() => {});
  },
};
