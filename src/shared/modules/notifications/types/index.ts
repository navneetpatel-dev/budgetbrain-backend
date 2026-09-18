import { z } from 'zod';
import { registerDeviceSchema } from '../validator/notification.validation';

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
