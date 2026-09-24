/**
 * Log and error-report scrubbing (plan T9.4, spec §22). Message text, file contents and
 * credentials must never reach log files, the console or Sentry, whatever code logs them.
 *
 * Values under a sensitive key are replaced, whatever their type; long strings anywhere are
 * cut, so a message body passed under an unexpected key is still not written out whole.
 */
export const REDACTED = '[redacted]';
const MAX_STRING = 300;
const MAX_DEPTH = 6;

/** Compared lower-case with `_` and `-` removed: `raw_content`, `rawContent` and `raw-content` match. */
const SENSITIVE_KEYS = new Set([
  'body',
  'rawbody',
  'rawcontent',
  'content',
  'text',
  'sms',
  'smsbody',
  'messagebody',
  'emailbody',
  'html',
  'csv',
  'file',
  'filecontent',
  'statement',
  'data',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'authorization',
  'cookie',
  'cookies',
  'otp',
  'secret',
]);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''));
}

function truncate(value: string): string {
  return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length - MAX_STRING} more chars]` : value;
}

/** A scrubbed copy; the input is never modified. */
export function redactValue(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return truncate(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[nested]';
  seen.add(value);
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, seen));
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message), stack: value.stack };
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, depth + 1, seen);
  }
  return out;
}

/** Winston keeps these as they are: they are written by our code, not taken from requests. */
const LOG_FIELDS = new Set(['level', 'timestamp', 'service', 'requestId', 'stack']);

/** Scrubs a winston info object's metadata in place (winston formats mutate `info`). */
export function redactLogInfo<T extends Record<string | symbol, unknown>>(info: T): T {
  for (const key of Object.keys(info)) {
    if (LOG_FIELDS.has(key)) continue;
    if (key === 'message') {
      info[key as keyof T] = (typeof info[key] === 'string' ? truncate(info[key] as string) : redactValue(info[key])) as T[keyof T];
    } else {
      info[key as keyof T] = (isSensitiveKey(key) ? REDACTED : redactValue(info[key])) as T[keyof T];
    }
  }
  return info;
}

interface SentryLikeEvent {
  request?: { data?: unknown; cookies?: unknown; query_string?: unknown; headers?: Record<string, string> };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: { data?: Record<string, unknown>; message?: string }[];
}

/**
 * Sentry `beforeSend`: request bodies, cookies and query strings are never sent (they can hold
 * pasted messages, statement files or tokens); extra data and breadcrumbs are scrubbed.
 */
export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = redactValue(event.request.headers) as Record<string, string>;
    }
  }
  if (event.extra) event.extra = redactValue(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = redactValue(event.contexts) as Record<string, unknown>;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      ...(crumb.message ? { message: truncate(crumb.message) } : {}),
      ...(crumb.data ? { data: redactValue(crumb.data) as Record<string, unknown> } : {}),
    }));
  }
  return event;
}
