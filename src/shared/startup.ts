import type { Application } from 'express';
import type { Logger } from 'winston';
import { connectDatabase } from './db/database';
import { dbEnv } from './db/env';
import type { LogService } from './logging';

export async function prepareDatabase(log: Logger): Promise<boolean> {
  const dbConnected = await connectDatabase();

  if (!dbConnected) {
    log.warn('Starting without database — DB-dependent routes will not work until connected');
    return false;
  }

  log.info('Database connected', {
    host: dbEnv.DB_HOST,
    database: dbEnv.DB_NAME,
  });

  return true;
}

export function listenAndLog(
  app: Application,
  log: Logger,
  platform: LogService,
  options: { port: number; apiVersion: string; environment: string }
): void {
  const { port, apiVersion, environment } = options;
  const apiUrl = `http://localhost:${port}/api/${apiVersion}`;
  const label = platform.toUpperCase();

  app.listen(port, () => {
    log.info('────────────────────────────────────────');
    log.info(`${label} API connected`);
    log.info(`  url:         ${apiUrl}`);
    log.info(`  port:        ${port}`);
    log.info(`  environment: ${environment}`);
    log.info('────────────────────────────────────────');
  });
}
