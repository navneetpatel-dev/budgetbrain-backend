import { env } from './env';

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  import('@sentry/node').then((Sentry) => {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
      // Pasted messages, emails and statement files must never leave the server (plan T6.2).
      beforeSend(event) {
        if (event.request?.url?.includes('/detected-transactions')) {
          delete event.request.data;
          delete event.request.query_string;
        }
        return event;
      },
    });
  });
}
