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

/**
 * Calls OpenAI Chat Completions. Throws OpenAiChatError on non-OK / empty replies.
 */
export async function chatCompletion(options: ChatCompletionOptions): Promise<string> {
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

  return content;
}
