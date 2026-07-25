import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import * as notificationService from '../service/notification.service';
import { sendPushToUser } from '../service/push.service';
import type { RegisterDeviceInput } from '../types';
import type { PaginationInput } from '../../../../shared/types';

export async function listNotifications(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await notificationService.listNotifications((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}

export async function markAsRead(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const notification = await notificationService.markAsRead((req as AuthRequest).userId!, id);
  successResponse(res, notification);
}

export async function registerDevice(req: Request, res: Response) {
  const device = await notificationService.registerDevice(
    (req as AuthRequest).userId!,
    req.body as RegisterDeviceInput
  );
  successResponse(res, device, 201);
}

export async function sendTestPush(req: Request, res: Response) {
  await sendPushToUser(
    (req as AuthRequest).userId!,
    'BudgetBrain Test',
    'Push notifications are working!'
  );
  successResponse(res, { message: 'Test notification sent' });
}
