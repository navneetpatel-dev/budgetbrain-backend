import { z } from 'zod';
import { optionalText } from '../../../../validation';

export const restoreSubscriptionSchema = z.object({
  revenueCatId: optionalText('revenueCatId'),
});
