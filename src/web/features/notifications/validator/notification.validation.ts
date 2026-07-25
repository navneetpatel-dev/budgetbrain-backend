import { z } from 'zod';
import { requiredText, FieldLimits, ValidationMessages as M, enumField } from '../../../../validation';

export const registerDeviceSchema = z.object({
  pushToken: requiredText('pushToken'),
  deviceName: z
    .string()
    .trim()
    .max(FieldLimits.deviceName.max, M.maxChars(FieldLimits.deviceName.max))
    .optional()
    .transform((v) => (v && v.length > 0 ? v : 'Unknown Device')),
  platform: enumField(['ios', 'android', 'web'] as const).default('android'),
});
