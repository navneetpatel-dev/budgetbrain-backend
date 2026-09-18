'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'exchange_rates'
       ) AS exists`,
      { type: queryInterface.sequelize.constructor.QueryTypes.SELECT }
    );

    if (tableExists[0]?.exists) return;

    await queryInterface.createTable('exchange_rates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      from_currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },
      to_currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },
      rate: {
        type: Sequelize.DECIMAL(16, 6),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('exchange_rates', ['from_currency', 'to_currency'], {
      unique: true,
      name: 'exchange_rates_from_to_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('exchange_rates', { cascade: true }).catch(() => {});
  },
};
