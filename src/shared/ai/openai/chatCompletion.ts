import { AI_COACH_CONFIG } from '../config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  apiKey: string;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenAiChatError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'OpenAiChatError';
  }
}

export interface ChatCompletionResult {
  content: string;
  usage: { totalTokens: number };
}

/**
 * Calls OpenAI Chat Completions. Throws OpenAiChatError on non-OK / empty replies.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? AI_COACH_CONFIG.model,
      temperature: options.temperature ?? AI_COACH_CONFIG.temperature,
      max_tokens: options.maxTokens ?? AI_COACH_CONFIG.maxTokens,
      messages: options.messages,
    }),
  });

  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
  };

  if (!response.ok) {
    throw new OpenAiChatError(
      data.error?.message || `OpenAI request failed (${response.status})`,
      response.status
    );
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OpenAiChatError('OpenAI returned an empty response');
  }

  return { content, usage: { totalTokens: data.usage?.total_tokens ?? 0 } };
}

export interface StreamChatCompletionResult {
  /** Async generator of incremental content deltas. */
  deltas: AsyncGenerator<string>;
  /** Resolves once the stream is fully drained, with the final content + real usage. */
  done: Promise<ChatCompletionResult>;
}

/**
 * Streaming variant of chatCompletion(). Requests `stream_options.include_usage` so the
 * final SSE chunk carries a real token count — otherwise usage is silently unavailable
 * under streaming and the AI quota system would have nothing to increment by.
 */
export async function streamChatCompletion(
  options: ChatCompletionOptions
): Promise<StreamChatCompletionResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model ?? AI_COACH_CONFIG.model,
      temperature: options.temperature ?? AI_COACH_CONFIG.temperature,
      max_tokens: options.maxTokens ?? AI_COACH_CONFIG.maxTokens,
      messages: options.messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });

  if (!response.ok || !response.body) {
    let message = `OpenAI request failed (${response.status})`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody.error?.message) message = errBody.error.message;
    } catch {
      // response body wasn't JSON (or already consumed) — keep the generic message
    }
    throw new OpenAiChatError(message, response.status);
  }

  let resolveDone!: (result: ChatCompletionResult) => void;
  let rejectDone!: (err: unknown) => void;
  const done = new Promise<ChatCompletionResult>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  async function* deltas(): AsyncGenerator<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let totalTokens = 0;

    try {
      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;

          let parsed: {
            choices?: { delta?: { content?: string } }[];
            usage?: { total_tokens?: number };
          };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue;
          }

          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            yield delta;
          }
          if (parsed.usage?.total_tokens) {
            totalTokens = parsed.usage.total_tokens;
          }
        }
      }

      if (!fullContent.trim()) {
        throw new OpenAiChatError('OpenAI returned an empty response');
      }
      resolveDone({ content: fullContent.trim(), usage: { totalTokens } });
    } catch (err) {
      rejectDone(err);
      throw err;
    }
  }

  return { deltas: deltas(), done };
}
