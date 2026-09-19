import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractReceiptData } from '../openai/visionExtraction';

describe('extractReceiptData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses a well-formed extraction response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  merchant: 'Swiggy',
                  amount: 450.5,
                  date: '2026-03-05',
                  confidence: 0.92,
                }),
              },
            },
          ],
        }),
      })
    );

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });

    expect(result).toEqual({
      merchant: 'Swiggy',
      amount: 450.5,
      date: '2026-03-05',
      confidence: 0.92,
    });
  });

  it('returns null fields as undefined and keeps confidence 0 when the model is unsure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ merchant: null, amount: null, date: null, confidence: 0.1 }),
              },
            },
          ],
        }),
      })
    );

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });

    expect(result).toEqual({ merchant: undefined, amount: undefined, date: undefined, confidence: 0.1 });
  });

  it('returns null (never throws) on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    );

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });
    expect(result).toBeNull();
  });

  it('returns null (never throws) on malformed JSON content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
      })
    );

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });
    expect(result).toBeNull();
  });

  it('returns null (never throws) when fetch itself rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });
    expect(result).toBeNull();
  });

  it('returns null when there is no content in the response at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) })
    );

    const result = await extractReceiptData({ apiKey: 'test-key', imageUrl: 'https://example.com/r.jpg' });
    expect(result).toBeNull();
  });
});
