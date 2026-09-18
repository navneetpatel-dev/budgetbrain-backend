import type { CorsOptions } from 'cors';

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?$/i;
const PRIVATE_LAN_ORIGIN =
  /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function configuredOrigins(corsOrigin: string): string[] | true {
  if (corsOrigin.trim() === '*') return true;
  return corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isAllowedCorsOrigin(origin: string | undefined, corsOrigin: string): boolean {
  if (!origin) return true;
  const configured = configuredOrigins(corsOrigin);
  if (configured === true) return true;
  if (configured.includes(origin)) return true;
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
