import { QueryTypes } from 'sequelize';
import { sequelize } from '@database/models';
import { resolvePagination } from '@shared/pagination';

const TRIGRAM_FALLBACK_THRESHOLD = 3;
const TRIGRAM_SIMILARITY_CUTOFF = 0.3;

let pgTrgmAvailable: boolean | null = null;

async function isPgTrgmAvailable(): Promise<boolean> {
  if (pgTrgmAvailable !== null) return pgTrgmAvailable;
  try {
    const rows = await sequelize.query<{ extname: string }>(
      `SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`,
      { type: QueryTypes.SELECT }
    );
    pgTrgmAvailable = rows.length > 0;
  } catch {
    pgTrgmAvailable = false;
  }
  return pgTrgmAvailable;
}

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

interface TrigramFallbackRow {
  id: string;
  type: string;
  amount: number;
  currency: string;
  merchant: string | null;
  notes: string | null;
  date: string;
  tags: string[] | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  similarity: number;
}

async function executeMerchantTrigramFallback(
  userId: string,
  query: string,
  limit: number
): Promise<TrigramFallbackRow[]> {
  const trgmSql = `
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
      similarity(t.merchant, :query) AS similarity
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = :userId
      AND t.merchant IS NOT NULL
      AND similarity(t.merchant, :query) > :cutoff
    ORDER BY similarity DESC, t.date DESC
    LIMIT :limit;
  `;

  try {
    return await sequelize.query<TrigramFallbackRow>(trgmSql, {
      replacements: { userId, query, cutoff: TRIGRAM_SIMILARITY_CUTOFF, limit },
      type: QueryTypes.SELECT,
    });
  } catch {
    // pg_trgm not installed, or the query otherwise failed — degrade to no fallback
    // results rather than breaking search entirely.
    return [];
  }
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

  let transactions = txRows.map((row) => ({
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

  // Typo-tolerant fallback: when exact full-text matching returns few/no results overall
  // (not just on this page — gate on `total`, not the current page's row count, so a
  // legitimately large result set never triggers this on later pages), fall back to
  // trigram similarity on merchant name (e.g. "Nteflix" -> "Netflix"). Only applies to
  // page 1, since injecting extra unpaginated fallback rows into an arbitrary later page
  // doesn't make sense. Fallback rows always rank below every real FTS match.
  if (page === 1 && total < TRIGRAM_FALLBACK_THRESHOLD && (await isPgTrgmAvailable())) {
    const existingIds = new Set(transactions.map((t) => t.id));
    const lowestFtsRank = transactions.length
      ? Math.min(...transactions.map((t) => t.rank))
      : 0;
    const fallbackRows = await executeMerchantTrigramFallback(userId, trimmed, limit);
    const fallbackTransactions = fallbackRows
      .filter((row) => !existingIds.has(row.id))
      .map((row) => ({
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
        // Synthetic rank strictly below the weakest real FTS match (or below 0 when
        // there were no FTS matches at all) so fallback results always sort last.
        rank: lowestFtsRank - 1 + Number(row.similarity ?? 0) * 0.001,
      }));
    transactions = [...transactions, ...fallbackTransactions];
  }

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
