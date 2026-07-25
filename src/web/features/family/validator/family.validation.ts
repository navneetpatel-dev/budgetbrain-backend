import { z } from 'zod';
import { requiredText, inviteCodeField } from '../../../../shared/validation';

export const createGroupSchema = z.object({
  name: requiredText('entityName'),
});

export const joinGroupSchema = z.object({
  inviteCode: inviteCodeField(),
});
