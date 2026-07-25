import { z } from 'zod';
import { updateProfileSchema, onboardingSchema } from '../validator/user.validation';

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
