import { z } from 'zod';
import { restoreSubscriptionSchema } from '../validator/subscription.validation';

export type RestoreSubscriptionInput = z.infer<typeof restoreSubscriptionSchema>;
