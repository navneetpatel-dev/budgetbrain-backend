import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import * as integrationsService from '../service/integrations.service';
import type {
  ConfirmParsedInput,
  ParseEmailInput,
  ParseSmsInput,
} from '../types';
import type { PaginationInput } from '../../../../shared/types';

export async function parseSms(req: Request, res: Response) {
  const { content } = req.body as ParseSmsInput;
  const result = await integrationsService.parseSms((req as AuthRequest).userId!, content);
  successResponse(res, result, 201);
}

export async function parseEmail(req: Request, res: Response) {
  const { subject, body } = req.body as ParseEmailInput;
  const result = await integrationsService.parseEmail(
    (req as AuthRequest).userId!,
    subject,
    body
  );
  successResponse(res, result, 201);
}

export async function listPending(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await integrationsService.listPending((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function confirmParsed(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const result = await integrationsService.confirmParsed(
    (req as AuthRequest).userId!,
    id,
    req.body as ConfirmParsedInput
  );
  successResponse(res, result);
}

export async function rejectParsed(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const result = await integrationsService.rejectParsed((req as AuthRequest).userId!, id);
  successResponse(res, result);
}
