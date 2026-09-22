import { Sequelize } from 'sequelize';
import { dbEnv } from './env';
import { createLogger } from '../../src/shared/logging';

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
  // Explicit pool config: this app runs as 3 separately-deployed processes
  // (mobile/web/admin) sharing one Postgres instance, and Sequelize's implicit
  // default (max:5, min:0) meant only ~15 connections total with no floor —
  // tune via DB_POOL_* per environment, not by editing these numbers directly.
  pool: {
    max: dbEnv.DB_POOL_MAX,
    min: dbEnv.DB_POOL_MIN,
    acquire: dbEnv.DB_POOL_ACQUIRE_MS,
    idle: dbEnv.DB_POOL_IDLE_MS,
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
