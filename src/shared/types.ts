import type { Request } from 'express';
import type { User } from '@database/models';

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface DateRangeInput {
  startDate?: string;
  endDate?: string;
}

export interface UuidParam {
  id: string;
}

export type PaginatedResult<K extends string, T> = {
  [P in K]: T[];
} & {
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
