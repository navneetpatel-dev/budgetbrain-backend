import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import * as aiService from '@shared/modules/ai/service/ai.service';
import type { ChatInput } from '@shared/modules/ai/ai.types';

export async function getInsights(req: Request, res: Response) {
  const data = await aiService.getSpendingInsights((req as AuthRequest).userId!);
  successResponse(res, data);
}

export async function getAnomalies(req: Request, res: Response) {
  const data = await aiService.detectAnomalies((req as AuthRequest).userId!);
  successResponse(res, data);
}

export async function listConversations(req: Request, res: Response) {
  const data = await aiService.listConversations((req as AuthRequest).userId!);
  successResponse(res, data);
}

export async function getConversation(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const data = await aiService.getConversation((req as AuthRequest).userId!, id);
  successResponse(res, data);
}

export async function chat(req: Request, res: Response) {
  const { message, conversationId } = req.body as ChatInput;
  const data = await aiService.chatWithCoach(
    (req as AuthRequest).userId!,
    message,
    conversationId
  );
  successResponse(res, data);
}

/**
 * SSE variant of `chat`. Headers are only set once the first token actually arrives —
 * if checkAiQuota() throws before that (e.g. AI_QUOTA_EXCEEDED), no SSE headers have
 * been written yet, so the error propagates through asyncHandler -> errorHandler as a
 * normal JSON 429 response instead of a broken half-started stream.
 */
export async function chatStream(req: Request, res: Response) {
  const { message, conversationId } = req.body as ChatInput;
  let headersSent = false;

  const data = await aiService.streamChatWithCoach(
    (req as AuthRequest).userId!,
    message,
    conversationId,
    (delta: string) => {
      if (!headersSent) {
        headersSent = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
      }
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  );

  res.write(
    `data: ${JSON.stringify({
      done: true,
      conversationId: data.conversationId,
      message: data.message,
      messages: data.messages,
    })}\n\n`
  );
  res.end();
}
