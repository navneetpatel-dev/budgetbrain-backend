import type { Request } from 'express';
import type { User } from '../../../shared/models';
import { z } from 'zod';
import { dateRangeSchema, paginationSchema, uuidParamSchema } from '../validation';

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type UuidParam = z.infer<typeof uuidParamSchema>;

export type PaginatedResult<K extends string, T> = Record<K, T[]> & {
  total: number;
  page: number;
  limit: number;
};

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface UploadResult {
  key: string;
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export type { User };
