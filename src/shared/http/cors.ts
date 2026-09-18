import type { CorsOptions } from 'cors';
import type { RequestHandler } from 'express';

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/i;
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function configuredOrigins(corsOrigin: string): string[] | true {
  const isProduction = process.env.NODE_ENV === 'production';
  if (corsOrigin.trim() === '*' && !isProduction) return true;
  return corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter((val) => Boolean(val) && val !== '*');
}

export function isAllowedCorsOrigin(origin: string | undefined, corsOrigin: string): boolean {
  if (!origin) return true;
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = configuredOrigins(corsOrigin);
  if (configured === true) return true;
  if (configured.includes(origin)) return true;
  if (isProduction) return false;
  return LOCAL_DEV_ORIGIN.test(origin) || PRIVATE_LAN_ORIGIN.test(origin);
}

export function createCorsOptions(corsOrigin: string): CorsOptions {
  return {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin, corsOrigin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    optionsSuccessStatus: 204,
    maxAge: 86400,
  };
}

/** Nginx must proxy /web/* → /*. If it forwards /web/api/v1, strip the prefix so routes match. */
export function stripNginxAppPrefix(prefix: 'web' | 'mobile' | 'admin'): RequestHandler {
  const base = `/${prefix}`;
  return (req, _res, next) => {
    if (req.url === base) {
      req.url = '/';
    } else if (req.url.startsWith(`${base}/`)) {
      req.url = req.url.slice(base.length) || '/';
    }
    next();
  };
}
