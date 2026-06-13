import { z } from 'zod';

export const createGroupSchema = z.object({ name: z.string() });
export const joinGroupSchema = z.object({ inviteCode: z.string() });
