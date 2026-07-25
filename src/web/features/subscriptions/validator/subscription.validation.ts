import { z } from 'zod';
import { optionalText } from '../../../../shared/validation';

export const restoreSubscriptionSchema = z.object({
  revenueCatId: optionalText('revenueCatId'),
});
