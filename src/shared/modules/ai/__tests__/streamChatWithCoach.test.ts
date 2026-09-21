import { describe, it, expect, vi, afterEach, afterAll, beforeAll } from 'vitest';
import { env } from '@config/env';
import { setupTestDb, createTestUser } from '@testHelpers';
import { AiConversation, AiUsageQuota } from '@database/models';
import { streamChatWithCoach } from '../service/ai.service';

function sseChunk(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/** Builds a mock streaming Response whose body yields the given SSE data chunks. */
function mockStreamingResponse(chunks: unknown[]): Response {
  const encodedChunks = chunks.map(sseChunk);
  encodedChunks.push(new TextEncoder().encode('data: [DONE]\n\n'));

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of encodedChunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  return { ok: true, status: 200, body: stream } as unknown as Response;
}

describe('streamChatWithCoach', () => {
  const previousOpenAiKey = env.OPENAI_API_KEY;

  beforeAll(async () => {
    await setupTestDb();
    // The streaming path is skipped when no key is configured (CI has none).
    env.OPENAI_API_KEY = previousOpenAiKey || 'sk-test-ci-not-a-real-key';
  });

  afterAll(() => {
    env.OPENAI_API_KEY = previousOpenAiKey;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams deltas, records the real token count, and persists the assembled reply', async () => {
    const user = await createTestUser();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockStreamingResponse([
          { choices: [{ delta: { content: 'You spent ' } }] },
          { choices: [{ delta: { content: '18% more ' } }] },
          { choices: [{ delta: { content: 'on dining.' } }] },
          { choices: [{}], usage: { total_tokens: 137 } },
        ])
      )
    );

    const received: string[] = [];
    const result = await streamChatWithCoach(user.id, 'How did I do this month?', undefined, (delta) => {
      received.push(delta);
    });

    expect(received.join('')).toBe('You spent 18% more on dining.');
    expect(result.reply).toBe('You spent 18% more on dining.');
    expect(result.message.role).toBe('assistant');

    const quota = await AiUsageQuota.findOne({ where: { userId: user.id } });
    expect(quota?.tokensUsed).toBe(137);

    const conversation = await AiConversation.findByPk(result.conversationId);
    const messages = conversation?.messages ?? [];
    expect(messages.at(-1)).toMatchObject({ role: 'assistant', content: 'You spent 18% more on dining.' });
    expect(messages.at(-2)).toMatchObject({ role: 'user', content: 'How did I do this month?' });
  });

  it('rejects before streaming starts once the monthly quota is exhausted', async () => {
    const user = await createTestUser();
    const periodMonth = new Date();
    periodMonth.setUTCDate(1);

    await AiUsageQuota.create({
      userId: user.id,
      periodMonth: periodMonth.toISOString().slice(0, 10),
      tokensUsed: 999_999_999,
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await expect(
      streamChatWithCoach(user.id, 'Hi', undefined, () => {
        throw new Error('onToken should never be called when quota is already exhausted');
      })
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED', statusCode: 429 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to the offline coach reply (still via onToken) when the model call fails mid-stream', async () => {
    const user = await createTestUser();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) })
    );

    const received: string[] = [];
    const result = await streamChatWithCoach(user.id, 'Give me a tip', undefined, (delta) => {
      received.push(delta);
    });

    // Fallback path emits the whole fallback message as a single onToken call.
    expect(received).toHaveLength(1);
    expect(result.reply).toBe(received[0]);
    expect(result.reply.length).toBeGreaterThan(0);
  });
});
