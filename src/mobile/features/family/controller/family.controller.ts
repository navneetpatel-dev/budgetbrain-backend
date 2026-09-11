import { Request, Response } from 'express';
import { successResponse } from '../../../shared/utils/errors';
import { AuthRequest } from '../../../shared/types';
import * as familyService from '../service/family.service';
import type { CreateGroupInput, CreateSplitInput, JoinGroupInput } from '../types';
import type { PaginationInput } from '../../../shared/types';

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

export async function listGroupMembers(req: Request, res: Response) {
  const { groupId } = req.params as { groupId: string };
  const members = await familyService.listGroupMembers((req as AuthRequest).userId!, groupId);
  successResponse(res, { members });
}

export async function createSplit(req: Request, res: Response) {
  const { groupId } = req.params as { groupId: string };
  const result = await familyService.createSplit(
    (req as AuthRequest).userId!,
    groupId,
    req.body as CreateSplitInput
  );
  successResponse(res, result, 201);
}

export async function getGroupBalances(req: Request, res: Response) {
  const { groupId } = req.params as { groupId: string };
  const balances = await familyService.getGroupBalances((req as AuthRequest).userId!, groupId);
  successResponse(res, { balances });
}

export async function settleSplit(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const result = await familyService.settleSplit((req as AuthRequest).userId!, id);
  successResponse(res, result);
}
