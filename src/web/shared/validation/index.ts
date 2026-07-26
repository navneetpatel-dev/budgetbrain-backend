import { z } from 'zod';
import {
  dateRangeObjectSchema,
  dateRangeSchema,
  paginationSchema,
  refineDateRangeOrder,
  uuidField,
} from '../../../shared/validation';

export {
  dateRangeObjectSchema,
  dateRangeSchema,
  paginationSchema,
  refineDateRangeOrder,
};

export const uuidParamSchema = z.object({
  id: uuidField(),
});
