import { env } from './env';

const INSECURE_SECRETS = [
  'change-me-access-secret-min-32-chars',
  'change-me-refresh-secret-min-32-chars',
  'dev-access-secret-minimum-32-characters-long',
  'dev-refresh-secret-minimum-32-characters-long',
];

export function validateProductionConfig(): void {
  if (env.NODE_ENV !== 'production') return;

  if (INSECURE_SECRETS.includes(env.JWT_ACCESS_SECRET) || INSECURE_SECRETS.includes(env.JWT_REFRESH_SECRET)) {
    throw new Error('Production requires secure JWT_ACCESS_SECRET and JWT_REFRESH_SECRET');
  }

  if (env.CORS_ORIGIN === '*') {
    throw new Error('Production requires explicit CORS_ORIGIN (comma-separated allowed origins)');
  }

  if (!env.REVENUECAT_WEBHOOK_SECRET) {
    console.warn('[WARN] REVENUECAT_WEBHOOK_SECRET not configured — subscription webhooks will not work');
  }

  if (!env.SMTP_USER) {
    console.warn('[WARN] SMTP not configured — email auth flows will not work');
  }

  if (!env.AWS_ACCESS_KEY_ID) {
    console.warn('[WARN] S3 not configured — receipts stored locally (ephemeral on container restart)');
  }
}
