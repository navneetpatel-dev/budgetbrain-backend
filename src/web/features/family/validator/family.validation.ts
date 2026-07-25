import { z } from 'zod';
import { requiredText } from '../../../../validation';

export const createGroupSchema = z.object({
  name: requiredText('entityName'),
});

export const joinGroupSchema = z.object({
  inviteCode: requiredText('inviteCode'),
});
