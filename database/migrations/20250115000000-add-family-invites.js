'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('family_invites', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      group_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'family_groups', key: 'id' },
        onDelete: 'CASCADE',
      },
      invited_email: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      invited_by_user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true,
      },
      role: {
        type: Sequelize.ENUM('admin', 'contributor', 'read_only'),
        allowNull: false,
        defaultValue: 'contributor',
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      accepted_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('family_invites', ['invited_email']);
    await queryInterface.addIndex('family_invites', ['group_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('family_invites');
  },
};
