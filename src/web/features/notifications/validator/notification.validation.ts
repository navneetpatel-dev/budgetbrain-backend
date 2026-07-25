import { z } from 'zod';
import { requiredText, FieldLimits, ValidationMessages as M } from '../../../../validation';

export const registerDeviceSchema = z.object({
  pushToken: requiredText('pushToken'),
  deviceName: z
    .string()
    .trim()
    .max(FieldLimits.deviceName.max, M.maxChars(FieldLimits.deviceName.max))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : 'Unknown Device')),
  platform: z.enum(['ios', 'android', 'web'], {
    errorMap: () => ({ message: M.enumInvalid }),
  }).default('android'),
});
