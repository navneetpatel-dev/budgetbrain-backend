import { z } from 'zod';

export const registerDeviceSchema = z.object({
  pushToken: z.string(),
  deviceName: z.string().default('Unknown Device'),
  platform: z.enum(['ios', 'android', 'web']).default('android'),
});
