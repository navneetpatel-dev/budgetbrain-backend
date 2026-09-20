import { z } from 'zod';
import {
  requiredText,
  inviteCodeField,
  uuidField,
  moneyValueField,
  emailField,
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

export const removeMemberParamSchema = z.object({
  groupId: uuidField(),
  userId: uuidField(),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'contributor', 'read_only']),
});

export const createFamilyInviteSchema = z.object({
  invitedEmail: emailField(),
  role: z.enum(['admin', 'contributor', 'read_only']).default('contributor'),
});

export const acceptFamilyInviteSchema = z.object({
  token: requiredText('token'),
});

