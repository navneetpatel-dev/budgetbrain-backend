import { z } from 'zod';
import { requiredText, FieldLimits } from '../../../../validation';

export const registerDeviceSchema = z.object({
  pushToken: requiredText('pushToken'),
  deviceName: z
    .string()
    .trim()
    .max(FieldLimits.deviceName.max)
    .default('Unknown Device'),
  platform: z.enum(['ios', 'android', 'web']).default('android'),
});
