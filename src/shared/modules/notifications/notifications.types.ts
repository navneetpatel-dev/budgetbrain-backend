import { z } from 'zod';
import { registerDeviceSchema } from './notifications.validator';

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
