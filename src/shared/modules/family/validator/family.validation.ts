import { z } from 'zod';
import {
  requiredText,
  inviteCodeField,
  uuidField,
  moneyValueField,
  ValidationMessages as M,
} from '@shared/validation';

export const createGroupSchema = z.object({
  name: requiredText('entityName'),
});

export const joinGroupSchema = z.object({
  inviteCode: inviteCodeField(),
});

export const groupIdParamSchema = z.object({
  groupId: uuidField(),
});

export const createSplitSchema = z.object({
  transactionId: uuidField(),
  participants: z
    .array(
      z.object({
        userId: uuidField(),
        shareAmount: moneyValueField(),
      })
    )
    .min(1, M.splitParticipantsMin)
    .max(20, M.splitParticipantsMax),
});
