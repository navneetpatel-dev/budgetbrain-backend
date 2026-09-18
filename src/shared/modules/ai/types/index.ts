import { z } from 'zod';
import { chatSchema } from '../validator/ai.validation';

export type ChatInput = z.infer<typeof chatSchema>;
