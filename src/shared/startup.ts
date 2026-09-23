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

import type { Server } from 'http';
import { sequelize } from '@database/models';
import { redis } from '@core/cache/redis.client';
import { stopWorkers } from '@queue/index';
import { stop as stopJobs } from '@jobs/index';

export function setupGracefulShutdown(
  server: Server,
  log: Logger,
  platform: string,
  options?: { stopJobsOnExit?: boolean; stopWorkersOnExit?: boolean }
): void {
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}. Starting graceful shutdown of ${platform}...`);

    server.close(async () => {
      log.info(`HTTP server closed for ${platform}.`);

      try {
        if (options?.stopJobsOnExit) {
          stopJobs();
          log.info('Scheduled jobs stopped.');
        }
        if (options?.stopWorkersOnExit) {
          await stopWorkers();
          log.info('Queue workers stopped.');
        }
        await sequelize.close();
        log.info('Database connections closed.');

        redis.disconnect();
        log.info('Redis connection closed.');
      } catch (err) {
        log.error('Error during shutdown', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        process.exit(0);
      }
    });

    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => {
      log.error('Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

export function listenAndLog(
  app: Application,
  log: Logger,
  platform: LogService,
  options: { port: number; apiVersion: string; environment: string }
): Server {
  const { port, apiVersion, environment } = options;
  const apiUrl = `http://localhost:${port}/api/${apiVersion}`;
  const label = platform.toUpperCase();

  return app.listen(port, () => {
    log.info('────────────────────────────────────────');
    log.info(`${label} API connected`);
    log.info(`  url:         ${apiUrl}`);
    log.info(`  port:        ${port}`);
    log.info(`  environment: ${environment}`);
    log.info('────────────────────────────────────────');
  });
}
