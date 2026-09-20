import { z } from 'zod';
import {
  createGroupSchema,
  joinGroupSchema,
  createSplitSchema,
  createFamilyInviteSchema,
  acceptFamilyInviteSchema,
} from '../validator/family.validation';

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type CreateSplitInput = z.infer<typeof createSplitSchema>;
export type CreateFamilyInviteInput = z.infer<typeof createFamilyInviteSchema>;
export type AcceptFamilyInviteInput = z.infer<typeof acceptFamilyInviteSchema>;
