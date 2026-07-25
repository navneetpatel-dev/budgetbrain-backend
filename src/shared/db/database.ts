import { Sequelize } from 'sequelize';
import { dbEnv } from './env';
import { createLogger } from '../logging';

const log = createLogger('system');
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);

function usesRemoteDatabase(): boolean {
  return !LOCAL_DB_HOSTS.has(dbEnv.DB_HOST);
}

const sequelizeOptions = {
  dialect: 'postgres' as const,
  logging:
    dbEnv.NODE_ENV === 'development'
      ? (sql: string) => log.debug(sql)
      : false,
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

export const sequelize = new Sequelize(dbEnv.DB_NAME, dbEnv.DB_USER, dbEnv.DB_PASSWORD, {
  host: dbEnv.DB_HOST,
  port: dbEnv.DB_PORT,
  ...sequelizeOptions,
});

export async function connectDatabase(): Promise<boolean> {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('Database connection failed', { message });
    return false;
  }
}
