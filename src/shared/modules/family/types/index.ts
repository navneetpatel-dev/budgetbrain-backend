import { z } from 'zod';
import { createGroupSchema, joinGroupSchema, createSplitSchema } from '../validator/family.validation';

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type CreateSplitInput = z.infer<typeof createSplitSchema>;
