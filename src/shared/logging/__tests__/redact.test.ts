import { describe, it, expect } from 'vitest';
import { REDACTED, redactValue, scrubSentryEvent } from '../redact';
import { redactLogInfo } from '../redact';

describe('log scrubbing (plan T9.4)', () => {
  it('replaces sensitive keys at any depth, whatever their spelling', () => {
    const input = {
      userId: 'u1',
      body: { kind: 'sms', text: 'Rs 250 debited' },
      nested: { raw_content: 'x', rawContent: 'y', 'raw-content': 'z', password: 'p', items: [{ refreshToken: 't', ok: 1 }] },
    };
    expect(redactValue(input)).toEqual({
      userId: 'u1',
      body: REDACTED,
      nested: { raw_content: REDACTED, rawContent: REDACTED, 'raw-content': REDACTED, password: REDACTED, items: [{ refreshToken: REDACTED, ok: 1 }] },
    });
    // The input is untouched.
    expect(input.body.text).toBe('Rs 250 debited');
  });

  it('cuts long strings under any key and survives cycles and buffers', () => {
    const cyclic: Record<string, unknown> = { note: 'a'.repeat(1000) };
    cyclic.self = cyclic;
    const out = redactValue({ cyclic, file: Buffer.from('abc'), blob: Buffer.from('abcd') }) as any;
    expect(out.cyclic.note).toHaveLength(300 + '…[700 more chars]'.length);
    expect(out.cyclic.self).toBe('[circular]');
    expect(out.file).toBe(REDACTED);
    expect(out.blob).toBe('[buffer 4 bytes]');
  });

  it('scrubs a winston info object but keeps the fields our code writes', () => {
    const info = redactLogInfo({
      level: 'error',
      message: 'm'.repeat(400),
      requestId: 'r1',
      stack: 'Error: x\n    at y',
      text: 'Rs 250 debited at SWIGGY',
      meta: { sms: 'secret' },
    });
    expect(info).toMatchObject({ level: 'error', requestId: 'r1', stack: 'Error: x\n    at y', text: REDACTED, meta: { sms: REDACTED } });
    expect((info.message as string).startsWith('m'.repeat(300))).toBe(true);
    expect((info.message as string).length).toBeLessThan(400);
  });

  it('never sends request bodies, cookies or query strings to Sentry', () => {
    const event = scrubSentryEvent({
      request: {
        data: '{"text":"Rs 250"}',
        cookies: 'sid=1',
        query_string: 'q=1',
        headers: { authorization: 'Bearer x', 'user-agent': 'ua' },
      },
      extra: { body: 'b', count: 2 },
      breadcrumbs: [{ message: 'fetch', data: { token: 't', url: '/x' } }],
    });
    expect(event.request).toEqual({ headers: { authorization: REDACTED, 'user-agent': 'ua' } });
    expect(event.extra).toEqual({ body: REDACTED, count: 2 });
    expect(event.breadcrumbs).toEqual([{ message: 'fetch', data: { token: REDACTED, url: '/x' } }]);
  });
});
