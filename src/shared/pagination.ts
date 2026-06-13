export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export type PaginatedResult<K extends string, T> = Record<K, T[]> & {
  total: number;
  page: number;
  limit: number;
};

export function resolvePagination(
  page?: number,
  limit?: number,
  defaultLimit: number = DEFAULT_LIMIT
) {
  const resolvedPage = Math.max(1, page ?? DEFAULT_PAGE);
  const resolvedLimit = Math.min(MAX_LIMIT, Math.max(1, limit ?? defaultLimit));
  return {
    page: resolvedPage,
    limit: resolvedLimit,
    offset: (resolvedPage - 1) * resolvedLimit,
  };
}

export function paginatedResult<K extends string, T>(
  key: K,
  rows: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<K, T> {
  return { [key]: rows, total, page, limit } as PaginatedResult<K, T>;
}
