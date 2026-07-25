import { z } from 'zod';
import { createGroupSchema, joinGroupSchema } from '../validator/family.validation';

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
