import { Request, Response } from 'express';
import { successResponse } from '../../../../shared/utils/errors';
import { AuthRequest } from '../../../../shared/types';
import * as familyService from '../service/family.service';
import type { CreateGroupInput, JoinGroupInput } from '../types';
import type { PaginationInput } from '../../../../shared/types';

export async function createGroup(req: Request, res: Response) {
  const { name } = req.body as CreateGroupInput;
  const group = await familyService.createGroup((req as AuthRequest).userId!, name);
  successResponse(res, group, 201);
}

export async function joinGroup(req: Request, res: Response) {
  const { inviteCode } = req.body as JoinGroupInput;
  const member = await familyService.joinGroup((req as AuthRequest).userId!, inviteCode);
  successResponse(res, member, 201);
}

export async function listMemberships(req: Request, res: Response) {
  const { page, limit } = req.query as PaginationInput;
  const data = await familyService.listUserMemberships((req as AuthRequest).userId!, {
    page,
    limit,
  });
  successResponse(res, data);
}
