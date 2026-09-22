import { Request, Response } from 'express';
import { successResponse } from '@core/http/errors';
import { AuthRequest } from '@shared/types';
import * as recurringService from '@shared/modules/recurring/service/recurringSeries.service';
import * as recurringDetectionService from '@shared/modules/recurring/service/recurringDetection.service';
import type { CreateRecurringSeriesInput, UpdateRecurringSeriesInput } from '@shared/modules/recurring/recurring.types';
import type { PaginationInput } from '@shared/types';

export async function listRecurringSeries(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await recurringService.listRecurringSeries((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function createRecurringSeries(req: Request, res: Response) {
  const series = await recurringService.createRecurringSeries(
    (req as AuthRequest).userId!,
    req.body as CreateRecurringSeriesInput
  );
  successResponse(res, series, 201);
}

export async function updateRecurringSeries(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const series = await recurringService.updateRecurringSeries(
    (req as AuthRequest).userId!,
    id,
    req.body as UpdateRecurringSeriesInput
  );
  successResponse(res, series);
}

export async function deleteRecurringSeries(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await recurringService.deleteRecurringSeries((req as AuthRequest).userId!, id);
  successResponse(res, { message: 'Recurring series deleted' });
}

export async function detectRecurring(req: Request, res: Response) {
  const series = await recurringDetectionService.detectRecurringPatternsForUser((req as AuthRequest).userId!);
  successResponse(res, { series });
}
