import { z } from 'zod';
import { syncBatchSchema } from '../validator/sync.validation';

export type SyncBatchInput = z.infer<typeof syncBatchSchema>;
export type SyncBatchItem = SyncBatchInput['items'][number];
