import { QueryTypes, type Transaction } from 'sequelize';
import type {
  KnowledgePack,
  PackCurrency,
  PackInstitution,
  PackKillSwitch,
  PackLexicon,
  PackMccMapping,
  PackMerchant,
  PackMerchantAlias,
  PackPaymentRail,
  PackSender,
  PackTaxonomyNode,
  PackTemplate,
} from '@budgetbrain/detection-core';
import { sequelize } from '@database/models';

/**
 * Knowledge-base persistence (plan T4.1). Writes are one bulk `INSERT … SELECT FROM
 * jsonb_to_recordset(…) ON CONFLICT DO UPDATE` per table, so an importer run costs a constant
 * number of queries whatever its size. Reads return only published rows.
 */

export type KbStatus = 'draft' | 'review' | 'published';

export interface WriteOptions {
  source: string;
  status?: KbStatus;
  transaction?: Transaction;
}

async function bulk(sql: string, rows: unknown[], options: WriteOptions): Promise<number> {
  if (rows.length === 0) return 0;
  await sequelize.query(sql, {
    replacements: { rows: JSON.stringify(rows), source: options.source, status: options.status ?? 'published' },
    transaction: options.transaction,
  });
  return rows.length;
}

// A changed row gets version + 1; an unchanged re-import leaves version and updated_at alone.
const touch = (table: string, columns: string[]) =>
  `version = CASE WHEN (${columns.map((c) => `"${table}"."${c}"`).join(', ')}) IS DISTINCT FROM (${columns
    .map((c) => `EXCLUDED."${c}"`)
    .join(', ')}) THEN "${table}".version + 1 ELSE "${table}".version END,
   updated_at = CASE WHEN (${columns.map((c) => `"${table}"."${c}"`).join(', ')}) IS DISTINCT FROM (${columns
     .map((c) => `EXCLUDED."${c}"`)
     .join(', ')}) THEN NOW() ELSE "${table}".updated_at END`;

export function upsertInstitutions(rows: PackInstitution[], options: WriteOptions) {
  const cols = ['name', 'display_name', 'country', 'type', 'bic', 'codes', 'domains', 'verified', 'status'];
  return bulk(
    `INSERT INTO kb_institutions (id, name, display_name, country, type, bic, codes, domains, verified, status, source)
     SELECT r.id, r.name, r."displayName", r.country, r.type, r.bic, COALESCE(r.codes, '{}'), COALESCE(r.domains, '[]'),
            COALESCE(r.verified, false), :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, name text, "displayName" text, country text, type text,
          bic text, codes jsonb, domains jsonb, verified boolean)
     ON CONFLICT (id) DO UPDATE SET ${touch('kb_institutions', cols)},
       name = EXCLUDED.name, display_name = EXCLUDED.display_name, country = EXCLUDED.country, type = EXCLUDED.type,
       bic = EXCLUDED.bic, codes = EXCLUDED.codes, domains = EXCLUDED.domains, verified = EXCLUDED.verified,
       status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertSenders(rows: (PackSender & { country: string })[], options: WriteOptions) {
  const cols = ['institution_id', 'match', 'status'];
  return bulk(
    `INSERT INTO kb_institution_senders (institution_id, country, channel, match, sender_key, status, source)
     SELECT r."institutionId", r.country, r.channel, r.match, r.key, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r("institutionId" text, country text, channel text, match text, key text)
     ON CONFLICT (country, channel, sender_key) DO UPDATE SET ${touch('kb_institution_senders', cols)},
       institution_id = EXCLUDED.institution_id, match = EXCLUDED.match, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertLexicons(rows: PackLexicon[], options: WriteOptions) {
  return bulk(
    `INSERT INTO kb_lexicons (language, class, phrases, status, source)
     SELECT r.language, r.class, r.phrases, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(language text, class text, phrases jsonb)
     ON CONFLICT (language, class) DO UPDATE SET ${touch('kb_lexicons', ['phrases', 'status'])},
       phrases = EXCLUDED.phrases, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertTemplates(rows: PackTemplate[], options: WriteOptions) {
  const cols = ['skeleton', 'field_map', 'direction', 'transaction_type', 'subtype', 'payment_method', 'date_order', 'status'];
  return bulk(
    `INSERT INTO kb_templates (id, institution_id, language, skeleton, field_map, direction, transaction_type, subtype,
                               payment_method, date_order, status, source)
     SELECT r.id, r."institutionId", r.language, r.skeleton, r.fields, r.direction, r."transactionType", r.subtype,
            r."paymentMethod", r."dateOrder", :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, "institutionId" text, language text, skeleton text,
          fields jsonb, direction text, "transactionType" text, subtype text, "paymentMethod" text, "dateOrder" text)
     ON CONFLICT (id) DO UPDATE SET ${touch('kb_templates', cols)},
       skeleton = EXCLUDED.skeleton, field_map = EXCLUDED.field_map, direction = EXCLUDED.direction,
       transaction_type = EXCLUDED.transaction_type, subtype = EXCLUDED.subtype, payment_method = EXCLUDED.payment_method,
       date_order = EXCLUDED.date_order, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertTaxonomy(rows: PackTaxonomyNode[], options: WriteOptions) {
  // The parent foreign key is checked at the end of the statement, so order inside it doesn't matter.
  return bulk(
    `INSERT INTO kb_category_taxonomy (code, parent, name, status, source)
     SELECT r.code, r.parent, r.name, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(code text, parent text, name text)
     ON CONFLICT (code) DO UPDATE SET ${touch('kb_category_taxonomy', ['parent', 'name', 'status'])},
       parent = EXCLUDED.parent, name = EXCLUDED.name, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertMerchants(rows: PackMerchant[], options: WriteOptions) {
  const cols = ['canonical_name', 'wikidata_id', 'domain', 'country', 'taxonomy_code', 'mcc', 'status'];
  return bulk(
    `INSERT INTO kb_merchants (id, canonical_name, wikidata_id, domain, country, taxonomy_code, mcc, status, source)
     SELECT r.id, r.name, r."wikidataId", r.domain, r.country, r."taxonomyCode", r.mcc, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, name text, "wikidataId" text, domain text, country text,
          "taxonomyCode" text, mcc text)
     ON CONFLICT (id) DO UPDATE SET ${touch('kb_merchants', cols)},
       canonical_name = EXCLUDED.canonical_name, wikidata_id = EXCLUDED.wikidata_id, domain = EXCLUDED.domain,
       country = EXCLUDED.country, taxonomy_code = EXCLUDED.taxonomy_code, mcc = EXCLUDED.mcc,
       status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertMerchantAliases(rows: PackMerchantAlias[], options: WriteOptions) {
  return bulk(
    `INSERT INTO kb_merchant_aliases (merchant_id, alias_key, country, status, source)
     SELECT r."merchantId", r.alias, COALESCE(r.country, ''), :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r("merchantId" text, alias text, country text)
     ON CONFLICT (alias_key, country) DO UPDATE SET ${touch('kb_merchant_aliases', ['merchant_id', 'status'])},
       merchant_id = EXCLUDED.merchant_id, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertMcc(rows: (PackMccMapping & { description?: string })[], options: WriteOptions) {
  return bulk(
    `INSERT INTO kb_mcc_categories (mcc, taxonomy_code, description, status, source)
     SELECT r.mcc, r."taxonomyCode", r.description, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(mcc text, "taxonomyCode" text, description text)
     ON CONFLICT (mcc) DO UPDATE SET ${touch('kb_mcc_categories', ['taxonomy_code', 'status'])},
       taxonomy_code = EXCLUDED.taxonomy_code, description = COALESCE(EXCLUDED.description, kb_mcc_categories.description),
       status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

export function upsertCurrencies(rows: PackCurrency[], options: WriteOptions & { keepSymbols?: boolean }) {
  // keepSymbols: the ISO importer knows codes and minor units only; it must not wipe the
  // symbols and number formats a country pack supplied.
  const symbols = options.keepSymbols
    ? `symbols = kb_currencies.symbols, ambiguous_symbols = kb_currencies.ambiguous_symbols,
       decimal_separator = kb_currencies.decimal_separator, group_separator = kb_currencies.group_separator,
       grouping = kb_currencies.grouping`
    : `symbols = EXCLUDED.symbols, ambiguous_symbols = EXCLUDED.ambiguous_symbols,
       decimal_separator = EXCLUDED.decimal_separator, group_separator = EXCLUDED.group_separator,
       grouping = EXCLUDED.grouping`;
  return bulk(
    `INSERT INTO kb_currencies (code, minor_units, symbols, ambiguous_symbols, decimal_separator, group_separator, grouping, status, source)
     SELECT r.code, r."minorUnits", COALESCE(r.symbols, '[]'), COALESCE(r."ambiguousSymbols", '[]'),
            COALESCE(r."decimalSeparator", '.'), COALESCE(r."groupSeparator", ','), COALESCE(r.grouping, 'standard'), :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(code text, "minorUnits" int, symbols jsonb, "ambiguousSymbols" jsonb,
          "decimalSeparator" text, "groupSeparator" text, grouping text)
     ON CONFLICT (code) DO UPDATE SET minor_units = EXCLUDED.minor_units, ${symbols},
       status = EXCLUDED.status, updated_at = NOW()`,
    rows,
    options
  );
}

export function upsertPaymentRails(rows: PackPaymentRail[], options: WriteOptions) {
  return bulk(
    `INSERT INTO kb_payment_rails (id, name, payment_method, countries, keywords, status, source)
     SELECT r.id, r.name, r."paymentMethod", r.countries, COALESCE(r.keywords, '[]'), :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, name text, "paymentMethod" text, countries jsonb, keywords jsonb)
     ON CONFLICT (id) DO UPDATE SET ${touch('kb_payment_rails', ['name', 'payment_method', 'countries', 'keywords', 'status'])},
       name = EXCLUDED.name, payment_method = EXCLUDED.payment_method, countries = EXCLUDED.countries,
       keywords = EXCLUDED.keywords, status = EXCLUDED.status, source = EXCLUDED.source`,
    rows,
    options
  );
}

// ---------------------------------------------------------------------------------------------
// Reads for the pack builder: published rows only, one query per table.
// ---------------------------------------------------------------------------------------------

function select<T extends object>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
}

function clean<T extends Record<string, unknown>>(row: T): T {
  // Optional pack fields are omitted rather than null (the pack schema rejects nulls there).
  for (const key of Object.keys(row)) if (row[key] === null) delete row[key];
  return row;
}

/** Everything published that a country's pack contains, in a stable order. */
export async function loadPackContents(country: string): Promise<Omit<KnowledgePack, 'meta'>> {
  const [institutions, senders, lexicons, templates, merchants, aliases, currencies, rails, taxonomy, mcc, killSwitches] =
    await Promise.all([
      select<Record<string, unknown>>(
        `SELECT id, name, display_name AS "displayName", country, type, bic, codes, domains, verified
         FROM kb_institutions WHERE country = :country AND status = 'published' ORDER BY id`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT s.institution_id AS "institutionId", s.channel, s.match, s.sender_key AS key
         FROM kb_institution_senders s JOIN kb_institutions i ON i.id = s.institution_id AND i.status = 'published'
         WHERE s.country = :country AND s.status = 'published' ORDER BY s.channel, s.sender_key`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT language, class, phrases FROM kb_lexicons WHERE status = 'published' ORDER BY language, class`
      ),
      select<Record<string, unknown>>(
        `SELECT t.id, t.institution_id AS "institutionId", t.version, t.language, t.skeleton, t.field_map AS fields,
                t.direction, t.transaction_type AS "transactionType", t.subtype, t.payment_method AS "paymentMethod",
                t.date_order AS "dateOrder"
         FROM kb_templates t JOIN kb_institutions i ON i.id = t.institution_id AND i.status = 'published'
         WHERE i.country = :country AND t.status = 'published' ORDER BY t.id`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT id, canonical_name AS name, country, wikidata_id AS "wikidataId", domain, taxonomy_code AS "taxonomyCode", mcc
         FROM kb_merchants WHERE (country = :country OR country IS NULL) AND status = 'published' ORDER BY id`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT a.merchant_id AS "merchantId", a.alias_key AS alias, NULLIF(a.country, '') AS country
         FROM kb_merchant_aliases a JOIN kb_merchants m ON m.id = a.merchant_id AND m.status = 'published'
           AND (m.country = :country OR m.country IS NULL)
         WHERE a.country IN (:country, '') AND a.status = 'published' ORDER BY a.alias_key, a.country`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT code, minor_units AS "minorUnits", symbols, ambiguous_symbols AS "ambiguousSymbols",
                decimal_separator AS "decimalSeparator", group_separator AS "groupSeparator", grouping
         FROM kb_currencies WHERE status = 'published' AND jsonb_array_length(symbols) > 0 ORDER BY code`
      ),
      select<Record<string, unknown>>(
        `SELECT id, name, payment_method AS "paymentMethod", countries, keywords FROM kb_payment_rails
         WHERE status = 'published' AND (countries IS NULL OR countries @> to_jsonb(CAST(:country AS text))) ORDER BY id`,
        { country }
      ),
      select<Record<string, unknown>>(
        `SELECT code, parent, name FROM kb_category_taxonomy WHERE status = 'published' ORDER BY code`
      ),
      select<Record<string, unknown>>(
        `SELECT mcc, taxonomy_code AS "taxonomyCode" FROM kb_mcc_categories WHERE status = 'published' ORDER BY mcc`
      ),
      select<Record<string, unknown>>(
        `SELECT scope, key, action, reason FROM kb_kill_switches WHERE active AND scope <> 'app_version' ORDER BY scope, key, action`
      ),
    ]);
  const currencyRows = currencies.map(clean).map((c) => {
    if (Array.isArray(c.ambiguousSymbols) && c.ambiguousSymbols.length === 0) delete c.ambiguousSymbols;
    return c;
  });
  return {
    institutions: institutions.map(clean) as unknown as PackInstitution[],
    senders: senders as unknown as PackSender[],
    lexicons: lexicons as unknown as PackLexicon[],
    templates: templates.map(clean) as unknown as PackTemplate[],
    merchants: merchants.map((m) => ({ ...clean({ ...m }), country: m.country ?? null })) as unknown as PackMerchant[],
    merchantAliases: aliases.map(clean) as unknown as PackMerchantAlias[],
    currencies: currencyRows as unknown as PackCurrency[],
    paymentRails: rails.map(clean) as unknown as PackPaymentRail[],
    taxonomy: taxonomy.map(clean) as unknown as PackTaxonomyNode[],
    mcc: mcc as unknown as PackMccMapping[],
    killSwitches: killSwitches.map(clean) as unknown as PackKillSwitch[],
  };
}

/** Countries with at least one published institution: the packs the nightly build produces. */
export async function publishedCountries(): Promise<string[]> {
  const rows = await select<{ country: string }>(
    `SELECT DISTINCT country FROM kb_institutions WHERE status = 'published' ORDER BY country`
  );
  return rows.map((r) => r.country);
}

/** Rows per table and country, for the importer coverage report (plan T4.2). */
export async function coverageByCountry(): Promise<
  { country: string; institutions: number; senders: number; templates: number; merchants: number; aliases: number }[]
> {
  return select(
    `SELECT c.country,
            (SELECT COUNT(*)::int FROM kb_institutions i WHERE i.country = c.country AND i.status = 'published') AS institutions,
            (SELECT COUNT(*)::int FROM kb_institution_senders s WHERE s.country = c.country AND s.status = 'published') AS senders,
            (SELECT COUNT(*)::int FROM kb_templates t JOIN kb_institutions i ON i.id = t.institution_id
               WHERE i.country = c.country AND t.status = 'published') AS templates,
            (SELECT COUNT(*)::int FROM kb_merchants m WHERE m.country = c.country AND m.status = 'published') AS merchants,
            (SELECT COUNT(*)::int FROM kb_merchant_aliases a WHERE a.country = c.country AND a.status = 'published') AS aliases
     FROM (SELECT DISTINCT country FROM kb_institutions) c ORDER BY c.country`
  );
}

export async function activeKillSwitches(): Promise<PackKillSwitch[]> {
  const rows = await select<Record<string, unknown>>(
    `SELECT scope, key, action, reason FROM kb_kill_switches WHERE active ORDER BY scope, key, action`
  );
  return rows.map(clean) as unknown as PackKillSwitch[];
}

// ---------------------------------------------------------------------------------------------
// Registry imports (plan T4.2): public registries add, they never overwrite curated rows
// ---------------------------------------------------------------------------------------------

async function bulkInserted(sql: string, rows: unknown[], options: WriteOptions): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await sequelize.query<{ n: number }>(`WITH w AS (${sql} RETURNING 1) SELECT count(*)::int AS n FROM w`, {
    type: QueryTypes.SELECT,
    replacements: { rows: JSON.stringify(rows), source: options.source, status: options.status ?? 'review' },
    transaction: options.transaction,
  });
  return Number(result[0]?.n ?? 0);
}

/**
 * Institutions from a public registry. A new institution lands in `review` for an admin to
 * publish. An existing one keeps its name, status and flags; the registry only fills a BIC it
 * lacks and adds national codes it doesn't have yet (its own codes win). Returns rows changed.
 */
export function addRegistryInstitutions(rows: PackInstitution[], options: WriteOptions) {
  const merged = `EXCLUDED.codes || kb_institutions.codes`;
  return bulkInserted(
    `INSERT INTO kb_institutions (id, name, display_name, country, type, bic, codes, domains, verified, status, source)
     SELECT r.id, r.name, r."displayName", r.country, r.type, r.bic, COALESCE(r.codes, '{}'), COALESCE(r.domains, '[]'),
            false, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, name text, "displayName" text, country text, type text,
          bic text, codes jsonb, domains jsonb)
     ON CONFLICT (id) DO UPDATE SET
       codes = ${merged}, bic = COALESCE(kb_institutions.bic, EXCLUDED.bic),
       version = kb_institutions.version + 1, updated_at = NOW()
     WHERE (kb_institutions.codes, kb_institutions.bic) IS DISTINCT FROM (${merged}, COALESCE(kb_institutions.bic, EXCLUDED.bic))`,
    rows,
    options
  );
}

/** Merchants and aliases from a public registry, in `review`. Existing ids and alias keys are left alone. */
export async function addRegistryMerchants(merchants: PackMerchant[], aliases: PackMerchantAlias[], options: WriteOptions) {
  const added = await bulkInserted(
    `INSERT INTO kb_merchants (id, canonical_name, wikidata_id, domain, country, taxonomy_code, mcc, status, source)
     SELECT r.id, r.name, r."wikidataId", r.domain, r.country, r."taxonomyCode", r.mcc, :status, :source
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(id text, name text, "wikidataId" text, domain text, country text,
          "taxonomyCode" text, mcc text)
     ON CONFLICT (id) DO NOTHING`,
    merchants,
    options
  );
  return (
    added +
    (await bulkInserted(
      `INSERT INTO kb_merchant_aliases (merchant_id, alias_key, country, status, source)
       SELECT r."merchantId", r.alias, COALESCE(r.country, ''), :status, :source
       FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r("merchantId" text, alias text, country text)
       WHERE EXISTS (SELECT 1 FROM kb_merchants m WHERE m.id = r."merchantId")
       ON CONFLICT (alias_key, country) DO NOTHING`,
      aliases,
      options
    ))
  );
}

/** What a registry import matches against: the catalog's institutions in these countries, any status. */
export async function institutionsIn(countries: string[], transaction?: Transaction) {
  if (countries.length === 0) return [];
  return sequelize.query<{ id: string; name: string; displayName: string | null; codes: Record<string, string> }>(
    `SELECT id, name, display_name AS "displayName", codes FROM kb_institutions WHERE country IN (:countries)`,
    { type: QueryTypes.SELECT, replacements: { countries }, transaction }
  );
}

/** Wikidata ids the catalog already has a merchant for. */
export async function merchantWikidataIds(ids: string[], transaction?: Transaction): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sequelize.query<{ wikidata_id: string }>(
    `SELECT wikidata_id FROM kb_merchants WHERE wikidata_id IN (:ids)`,
    { type: QueryTypes.SELECT, replacements: { ids }, transaction }
  );
  return new Set(rows.map((r) => r.wikidata_id));
}
