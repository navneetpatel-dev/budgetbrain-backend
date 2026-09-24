import { env } from './env';
import { scrubSentryEvent } from '../shared/logging/redact';

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;

  import('@sentry/node').then((Sentry) => {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
      // Pasted messages, statement files and tokens never leave the server (plan T6.2, T9.4):
      // no request bodies, cookies or query strings, and scrubbed extra data and breadcrumbs.
      beforeSend(event) {
        return scrubSentryEvent(event);
      },
      beforeBreadcrumb(breadcrumb) {
        return scrubSentryEvent({ breadcrumbs: [breadcrumb] }).breadcrumbs?.[0] ?? null;
      },
    });
  });
}
