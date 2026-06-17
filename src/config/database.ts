import { Sequelize } from 'sequelize';
import { env } from './env';

const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1']);

function databaseUrlHost(url: string): string | null {
  try {
    return new URL(url.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  } catch {
    return null;
  }
}

function isRemoteHost(host: string): boolean {
  return !LOCAL_DB_HOSTS.has(host);
}

function useDatabaseUrl(): boolean {
  if (!env.DATABASE_URL) return false;

  const urlHost = databaseUrlHost(env.DATABASE_URL);
  const hostIsRemote = isRemoteHost(env.DB_HOST);

  // Ignore leftover localhost DATABASE_URL when DB_HOST points to a real server.
  if (urlHost && LOCAL_DB_HOSTS.has(urlHost) && hostIsRemote) {
    return false;
  }

  return true;
}

function usesRemoteDatabase(): boolean {
  if (useDatabaseUrl() && env.DATABASE_URL) {
    const urlHost = databaseUrlHost(env.DATABASE_URL);
    return urlHost ? isRemoteHost(urlHost) : false;
  }

  return isRemoteHost(env.DB_HOST);
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

export const sequelize = useDatabaseUrl()
  ? new Sequelize(env.DATABASE_URL!, sequelizeOptions)
  : new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
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
