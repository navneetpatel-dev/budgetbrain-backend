import { z } from 'zod';
import { dateRangeSchema, paginationSchema, uuidField } from '../../../shared/validation';

export { dateRangeSchema, paginationSchema };

export const uuidParamSchema = z.object({
  id: uuidField(),
});
