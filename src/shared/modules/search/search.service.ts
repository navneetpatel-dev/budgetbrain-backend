import { QueryTypes } from 'sequelize';
import { sequelize } from '@database/models';
import { resolvePagination } from '@shared/pagination';

export interface GlobalSearchResults {
  query: string;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    merchant: string | null;
    notes: string | null;
    date: string;
    tags: string[];
    category?: {
      id: string;
      name: string;
      icon: string | null;
      color: string | null;
    } | null;
    rank: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    rank: number;
  }>;
  incomeSources: Array<{
    id: string;
    name: string;
    type: string;
    rank: number;
  }>;
  total: number;
  page: number;
  limit: number;
}

export async function executeGlobalSearch(
  userId: string,
  rawQuery: string,
  pagination: { page?: number; limit?: number } = {}
): Promise<GlobalSearchResults> {
  const trimmed = rawQuery.trim();
  const { page, limit, offset } = resolvePagination(pagination.page, pagination.limit, 20);

  if (!trimmed) {
    return {
      query: '',
      transactions: [],
      categories: [],
      incomeSources: [],
      total: 0,
      page,
      limit,
    };
  }

  // 1. Full-text search on transactions and associated categories using websearch_to_tsquery
  const txSql = `
    SELECT
      t.id,
      t.type,
      CAST(t.amount AS DOUBLE PRECISION) AS amount,
      t.currency,
      t.merchant,
      t.notes,
      t.date,
      t.tags,
      c.id AS "categoryId",
      c.name AS "categoryName",
      c.icon AS "categoryIcon",
      c.color AS "categoryColor",
      ts_rank(t.fts, websearch_to_tsquery('english', :query)) AS rank
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = :userId
      AND (
        t.fts @@ websearch_to_tsquery('english', :query)
        OR (c.fts IS NOT NULL AND c.fts @@ websearch_to_tsquery('english', :query))
      )
    ORDER BY rank DESC, t.date DESC
    LIMIT :limit OFFSET :offset;
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = :userId
      AND (
        t.fts @@ websearch_to_tsquery('english', :query)
        OR (c.fts IS NOT NULL AND c.fts @@ websearch_to_tsquery('english', :query))
      );
  `;

  // 2. Full-text search on categories
  const catSql = `
    SELECT
      id,
      name,
      icon,
      color,
      ts_rank(fts, websearch_to_tsquery('english', :query)) AS rank
    FROM categories
    WHERE user_id = :userId
      AND fts @@ websearch_to_tsquery('english', :query)
      AND is_archived = false
    ORDER BY rank DESC, sort_order ASC
    LIMIT 10;
  `;

  // 3. Full-text search on income sources
  const incomeSql = `
    SELECT
      id,
      name,
      type,
      ts_rank(fts, websearch_to_tsquery('english', :query)) AS rank
    FROM income_sources
    WHERE user_id = :userId
      AND fts @@ websearch_to_tsquery('english', :query)
    ORDER BY rank DESC
    LIMIT 10;
  `;

  const [txRows, countRows, catRows, incomeRows] = await Promise.all([
    sequelize.query<any>(txSql, {
      replacements: { userId, query: trimmed, limit, offset },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<{ total: string }>(countSql, {
      replacements: { userId, query: trimmed },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<any>(catSql, {
      replacements: { userId, query: trimmed },
      type: QueryTypes.SELECT,
    }),
    sequelize.query<any>(incomeSql, {
      replacements: { userId, query: trimmed },
      type: QueryTypes.SELECT,
    }),
  ]);

  const total = parseInt(countRows[0]?.total ?? '0', 10);

  const transactions = txRows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    currency: row.currency,
    merchant: row.merchant,
    notes: row.notes,
    date: row.date,
    tags: row.tags ?? [],
    category: row.categoryId
      ? {
          id: row.categoryId,
          name: row.categoryName,
          icon: row.categoryIcon,
          color: row.categoryColor,
        }
      : null,
    rank: Number(row.rank ?? 0),
  }));

  const categories = catRows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    rank: Number(row.rank ?? 0),
  }));

  const incomeSources = incomeRows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    rank: Number(row.rank ?? 0),
  }));

  return {
    query: trimmed,
    transactions,
    categories,
    incomeSources,
    total,
    page,
    limit,
  };
}
