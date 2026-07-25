import { Sequelize } from 'sequelize';
import { env } from './env';

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);

function usesRemoteDatabase(): boolean {
  return !LOCAL_DB_HOSTS.has(env.DB_HOST);
}

const sequelizeOptions = {
  dialect: 'postgres' as const,
  logging: env.NODE_ENV === 'development' ? console.log : false,
  define: {
    underscored: true,
    timestamps: true,
  },
  ...(usesRemoteDatabase()
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
      }
    : {}),
};

export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  ...sequelizeOptions,
});

export async function connectDatabase(): Promise<boolean> {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Database connection failed: ${message}`);
    return false;
  }
}
