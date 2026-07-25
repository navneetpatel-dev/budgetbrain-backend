import fs from 'fs';
import path from 'path';
import winston from 'winston';

export type LogService = 'mobile' | 'web' | 'admin' | 'system';

const LOG_DIR = path.join(process.cwd(), 'logs');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, requestId, ...meta }) => {
    const svc = service ? `[${service}]` : '';
    const req = requestId ? `[${requestId}]` : '';
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${svc}${req} ${message}${rest}`;
  })
);

let rootLogger: winston.Logger | null = null;

function getRootLogger(): winston.Logger {
  if (rootLogger) return rootLogger;

  ensureLogDir();

  const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

  rootLogger = winston.createLogger({
    level,
    defaultMeta: {},
    transports: [
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'error.log'),
        level: 'error',
        format: jsonFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(LOG_DIR, 'combined.log'),
        format: jsonFormat,
        maxsize: 20 * 1024 * 1024,
        maxFiles: 10,
      }),
      new winston.transports.Console({
        format: consoleFormat,
      }),
    ],
  });

  return rootLogger;
}

export function createLogger(service: LogService): winston.Logger {
  return getRootLogger().child({ service });
}

export const logger = createLogger('system');
