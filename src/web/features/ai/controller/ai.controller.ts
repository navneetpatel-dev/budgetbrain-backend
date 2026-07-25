import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as aiService from '../service/ai.service';
import type { ChatInput } from '../types';

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
