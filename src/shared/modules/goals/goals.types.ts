import { z } from 'zod';
import { createGoalSchema, updateGoalSchema, contributeGoalSchema } from './goals.validator';

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type ContributeGoalInput = z.infer<typeof contributeGoalSchema>;
