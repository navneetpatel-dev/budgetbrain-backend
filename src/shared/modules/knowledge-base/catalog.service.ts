import { QueryTypes, type Transaction } from 'sequelize';
import { z, type ZodTypeAny } from 'zod';
import { LEXICON_CLASSES, TRANSACTION_SUBTYPES, TRANSACTION_TYPES, PAYMENT_METHODS, type PackTemplate } from '@budgetbrain/detection-core';
import { sequelize } from '@database/models';
import { AppError, NotFoundError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { checkTemplate } from '@modules/transaction-detection/skeletons.service';

/**
 * Admin catalog editing (plan T7.3): institutions, senders, lexicons, templates, merchants,
 * aliases, MCC codes and the taxonomy, with draft → review → published and a version history.
 *
 * Every table is described once below; the service stays generic. Only published rows reach a
 * pack, so an edited row returns to draft (and leaves the next pack) until it is published
 * again; `kb_catalog_history` keeps every earlier version.
 */

export const CATALOG_ENTITIES = ['institutions', 'senders', 'lexicons', 'templates', 'merchants', 'aliases', 'mcc', 'taxonomy'] as const;
export type CatalogEntity = (typeof CATALOG_ENTITIES)[number];
export type CatalogStatus = 'draft' | 'review' | 'published';

interface FieldDef {
  column: string;
  schema: ZodTypeAny;
  json?: boolean;
}

interface EntityDef {
  table: string;
  idColumn: string;
  /** `provided`: the admin chooses the id (e.g. `in.hdfc_bank`); `uuid`: generated. */
  id: 'provided' | 'uuid';
  idSchema?: ZodTypeAny;
  fields: Record<string, FieldDef>;
  /** Columns searched by `q`. */
  search: string[];
  /** Extra checks before a row is published. */
  beforePublish?: (row: Record<string, unknown>) => void;
}

const slug = z.string().trim().regex(/^[a-z0-9][a-z0-9_.-]{1,79}$/, 'Lower-case letters, digits, dot, dash and underscore');
const country = z.string().trim().regex(/^[A-Z]{2}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

const ENTITIES: Record<CatalogEntity, EntityDef> = {
  institutions: {
    table: 'kb_institutions',
    idColumn: 'id',
    id: 'provided',
    idSchema: slug,
    fields: {
      name: { column: 'name', schema: text(200) },
      displayName: { column: 'display_name', schema: text(120) },
      country: { column: 'country', schema: country },
      type: { column: 'type', schema: z.enum(['bank', 'card_issuer', 'wallet', 'nbfc', 'payment_app', 'broker', 'credit_union']) },
      bic: { column: 'bic', schema: z.string().trim().regex(/^[A-Z0-9]{8,11}$/).nullable().optional() },
      codes: { column: 'codes', schema: z.record(z.string(), z.string().max(40)).optional(), json: true },
      domains: { column: 'domains', schema: z.array(z.string().trim().max(200)).max(50).optional(), json: true },
      verified: { column: 'verified', schema: z.boolean().optional() },
    },
    search: ['id', 'name', 'display_name'],
  },
  senders: {
    table: 'kb_institution_senders',
    idColumn: 'id',
    id: 'uuid',
    fields: {
      institutionId: { column: 'institution_id', schema: slug },
      country: { column: 'country', schema: country },
      channel: { column: 'channel', schema: z.enum(['sms', 'email', 'notification']) },
      match: { column: 'match', schema: z.enum(['header', 'exact', 'domain']) },
      key: { column: 'sender_key', schema: text(200) },
    },
    search: ['sender_key', 'institution_id'],
  },
  lexicons: {
    table: 'kb_lexicons',
    idColumn: 'id',
    id: 'uuid',
    fields: {
      language: { column: 'language', schema: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/) },
      class: { column: 'class', schema: z.enum(LEXICON_CLASSES) },
      phrases: { column: 'phrases', schema: z.array(text(120)).min(1).max(500), json: true },
    },
    search: ['language', 'class'],
  },
  templates: {
    table: 'kb_templates',
    idColumn: 'id',
    id: 'provided',
    idSchema: slug,
    fields: {
      institutionId: { column: 'institution_id', schema: slug },
      language: { column: 'language', schema: z.string().trim().min(2).max(20) },
      skeleton: { column: 'skeleton', schema: text(1200) },
      fields: {
        column: 'field_map',
        schema: z.array(z.enum(['amount', 'balance', 'limit', 'date', 'time', 'account', 'reference', 'merchant', 'counterparty', 'ignore'])).max(40),
        json: true,
      },
      direction: { column: 'direction', schema: z.enum(['DEBIT', 'CREDIT']) },
      transactionType: { column: 'transaction_type', schema: z.enum(TRANSACTION_TYPES) },
      subtype: { column: 'subtype', schema: z.enum(TRANSACTION_SUBTYPES).nullable().optional() },
      paymentMethod: { column: 'payment_method', schema: z.enum(PAYMENT_METHODS).nullable().optional() },
      dateOrder: { column: 'date_order', schema: z.enum(['DMY', 'MDY', 'YMD']).nullable().optional() },
      sample: { column: 'sample', schema: optionalText(1200) },
    },
    search: ['id', 'skeleton', 'institution_id'],
    beforePublish: (row) => {
      if (!row.sample) throw new AppError(400, 'Add a sample message before publishing a template', 'TEMPLATE_SAMPLE_REQUIRED');
      checkTemplate(
        {
          id: String(row.id),
          institutionId: String(row.institutionId),
          version: Number(row.version ?? 1),
          language: String(row.language),
          skeleton: String(row.skeleton),
          fields: row.fields as PackTemplate['fields'],
          direction: row.direction as PackTemplate['direction'],
          transactionType: row.transactionType as PackTemplate['transactionType'],
        },
        String(row.sample)
      );
    },
  },
  merchants: {
    table: 'kb_merchants',
    idColumn: 'id',
    id: 'provided',
    idSchema: slug,
    fields: {
      name: { column: 'canonical_name', schema: text(200) },
      wikidataId: { column: 'wikidata_id', schema: z.string().trim().regex(/^Q\d+$/).nullable().optional() },
      domain: { column: 'domain', schema: optionalText(200) },
      country: { column: 'country', schema: country.nullable().optional() },
      taxonomyCode: { column: 'taxonomy_code', schema: text(80) },
      mcc: { column: 'mcc', schema: z.string().regex(/^\d{4}$/).nullable().optional() },
    },
    search: ['id', 'canonical_name'],
  },
  aliases: {
    table: 'kb_merchant_aliases',
    idColumn: 'id',
    id: 'uuid',
    fields: {
      merchantId: { column: 'merchant_id', schema: slug },
      alias: { column: 'alias_key', schema: z.string().trim().toLowerCase().min(2).max(200) },
      // Empty string is a global alias (the unique index covers it).
      country: { column: 'country', schema: z.union([country, z.literal('')]).optional() },
    },
    search: ['alias_key', 'merchant_id'],
  },
  mcc: {
    table: 'kb_mcc_categories',
    idColumn: 'mcc',
    id: 'provided',
    idSchema: z.string().regex(/^\d{4}$/),
    fields: {
      taxonomyCode: { column: 'taxonomy_code', schema: text(80) },
      description: { column: 'description', schema: optionalText(200) },
    },
    search: ['mcc', 'description'],
  },
  taxonomy: {
    table: 'kb_category_taxonomy',
    idColumn: 'code',
    id: 'provided',
    idSchema: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/),
    fields: {
      name: { column: 'name', schema: text(120) },
      parent: { column: 'parent', schema: z.string().trim().max(80).nullable().optional() },
    },
    search: ['code', 'name'],
  },
};

export function isCatalogEntity(value: string): value is CatalogEntity {
  return (CATALOG_ENTITIES as readonly string[]).includes(value);
}

function def(entity: CatalogEntity): EntityDef {
  return ENTITIES[entity];
}

/** Row → API shape: camelCase field names plus id, status, version, source and timestamps. */
function selectList(d: EntityDef): string {
  const fields = Object.entries(d.fields).map(([name, f]) => `"${f.column}" AS "${name}"`);
  return [`"${d.idColumn}"::text AS id`, ...fields, 'status', 'version', 'source', 'created_at AS "createdAt"', 'updated_at AS "updatedAt"'].join(', ');
}

function parseData(d: EntityDef, data: unknown, partial: boolean): Record<string, unknown> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [name, f] of Object.entries(d.fields)) shape[name] = partial ? f.schema.optional() : f.schema;
  const result = z.object(shape).strict().safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(400, `${issue?.path.join('.') || 'data'}: ${issue?.message ?? 'invalid'}`, 'VALIDATION_ERROR');
  }
  return Object.fromEntries(Object.entries(result.data).filter(([, v]) => v !== undefined));
}

async function recordHistory(
  entity: CatalogEntity,
  row: Record<string, unknown>,
  action: string,
  adminId: string | null,
  transaction: Transaction
) {
  await sequelize.query(
    `INSERT INTO kb_catalog_history (entity, entity_id, version, status, action, data, changed_by)
     VALUES (:entity, :entityId, :version, :status, :action, CAST(:data AS jsonb), :adminId)`,
    {
      replacements: {
        entity,
        entityId: String(row.id),
        version: Number(row.version),
        status: String(row.status),
        action,
        data: JSON.stringify(row),
        adminId,
      },
      transaction,
    }
  );
}

export async function listCatalog(
  entity: CatalogEntity,
  filters: { status?: CatalogStatus; q?: string; page?: number; limit?: number }
): Promise<{ items: Record<string, unknown>[]; total: number; page: number; limit: number }> {
  const d = def(entity);
  const page = filters.page ?? 1;
  const limit = Math.min(filters.limit ?? 50, 200);
  const where: string[] = [];
  const replacements: Record<string, unknown> = { limit, offset: (page - 1) * limit };
  if (filters.status) {
    where.push('status = :status');
    replacements.status = filters.status;
  }
  if (filters.q) {
    where.push(`(${d.search.map((c) => `"${c}"::text ILIKE :q`).join(' OR ')})`);
    replacements.q = `%${filters.q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [items, [count]] = await Promise.all([
    sequelize.query<Record<string, unknown>>(
      `SELECT ${selectList(d)} FROM "${d.table}" ${clause} ORDER BY updated_at DESC, "${d.idColumn}" LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query<{ n: string }>(`SELECT count(*) AS n FROM "${d.table}" ${clause}`, { type: QueryTypes.SELECT, replacements }),
  ]);
  return { items, total: Number(count?.n ?? 0), page, limit };
}

async function loadRow(entity: CatalogEntity, id: string, transaction?: Transaction): Promise<Record<string, unknown>> {
  const d = def(entity);
  const [row] = await sequelize.query<Record<string, unknown>>(
    `SELECT ${selectList(d)} FROM "${d.table}" WHERE "${d.idColumn}"::text = :id`,
    { type: QueryTypes.SELECT, replacements: { id }, transaction }
  );
  if (!row) throw new NotFoundError(`${entity} ${id} not found`);
  return row;
}

export function getCatalogRow(entity: CatalogEntity, id: string) {
  return loadRow(entity, id);
}

function sqlValue(field: FieldDef, value: unknown): unknown {
  return field.json ? JSON.stringify(value) : value;
}

function placeholder(field: FieldDef, name: string): string {
  return field.json ? `CAST(:${name} AS jsonb)` : `:${name}`;
}

/** New rows start as drafts. */
export async function createCatalogRow(
  entity: CatalogEntity,
  body: { id?: string; data: unknown },
  adminId: string | null,
  options: { source?: string } = {}
): Promise<Record<string, unknown>> {
  const d = def(entity);
  const data = parseData(d, body.data, false);
  let id: string | undefined;
  if (d.id === 'provided') {
    const parsed = (d.idSchema ?? slug).safeParse(body.id);
    if (!parsed.success) throw new AppError(400, `id: ${parsed.error.issues[0]?.message ?? 'invalid'}`, 'VALIDATION_ERROR');
    id = parsed.data as string;
  }
  const columns: string[] = [];
  const values: string[] = [];
  const replacements: Record<string, unknown> = { source: options.source ?? 'admin' };
  if (id !== undefined) {
    columns.push(`"${d.idColumn}"`);
    values.push(':id');
    replacements.id = id;
  }
  for (const [name, value] of Object.entries(data)) {
    const field = d.fields[name]!;
    columns.push(`"${field.column}"`);
    values.push(placeholder(field, name));
    replacements[name] = sqlValue(field, value);
  }
  return sequelize.transaction(async (t) => {
    let inserted: { id: string }[];
    try {
      inserted = await sequelize.query<{ id: string }>(
        `INSERT INTO "${d.table}" (${columns.join(', ')}, status, version, source)
         VALUES (${values.join(', ')}, 'draft', 1, :source) RETURNING "${d.idColumn}"::text AS id`,
        { type: QueryTypes.SELECT, replacements, transaction: t }
      );
    } catch (error) {
      const code = (error as { parent?: { code?: string } }).parent?.code;
      if (code === '23505') throw new AppError(409, 'A row with this key already exists', 'CONFLICT');
      if (code === '23503') throw new AppError(400, 'A referenced row does not exist', 'VALIDATION_ERROR');
      throw error;
    }
    const row = await loadRow(entity, inserted[0]!.id, t);
    await recordHistory(entity, row, 'create', adminId, t);
    await writeAuditLog({
      action: AuditAction.KB_CHANGE,
      resource: AuditResource.KNOWLEDGE_BASE,
      // resource_id is a uuid column; catalog keys are text, so they go in metadata.
      metadata: { entity, id: String(row.id) },
      actorUserId: adminId ?? undefined,
      afterState: { status: 'draft', version: 1 },
      transaction: t,
    });
    return row;
  });
}

/** An edit bumps the version and returns the row to draft; history keeps the previous data. */
export async function updateCatalogRow(entity: CatalogEntity, id: string, body: unknown, adminId: string | null) {
  const d = def(entity);
  const data = parseData(d, body, true);
  if (Object.keys(data).length === 0) throw new AppError(400, 'Nothing to update', 'VALIDATION_ERROR');
  const sets: string[] = [];
  const replacements: Record<string, unknown> = { id };
  for (const [name, value] of Object.entries(data)) {
    const field = d.fields[name]!;
    sets.push(`"${field.column}" = ${placeholder(field, name)}`);
    replacements[name] = sqlValue(field, value);
  }
  return sequelize.transaction(async (t) => {
    const before = await loadRow(entity, id, t);
    await sequelize.query(
      `UPDATE "${d.table}" SET ${sets.join(', ')}, status = 'draft', version = version + 1, updated_at = NOW()
       WHERE "${d.idColumn}"::text = :id`,
      { replacements, transaction: t }
    );
    const row = await loadRow(entity, id, t);
    await recordHistory(entity, row, 'update', adminId, t);
    await writeAuditLog({
      action: AuditAction.KB_CHANGE,
      resource: AuditResource.KNOWLEDGE_BASE,
      metadata: { entity, id },
      actorUserId: adminId ?? undefined,
      beforeState: { version: before.version, status: before.status },
      afterState: { version: row.version, status: 'draft' },
      transaction: t,
    });
    return row;
  });
}

const NEXT: Record<CatalogStatus, CatalogStatus[]> = {
  draft: ['review', 'published'],
  review: ['draft', 'published'],
  published: ['draft'],
};

/** draft → review → published (or straight to published); published → draft withdraws a row. */
export async function setCatalogStatus(entity: CatalogEntity, id: string, status: CatalogStatus, adminId: string | null) {
  const d = def(entity);
  return sequelize.transaction(async (t) => {
    const before = await loadRow(entity, id, t);
    const from = before.status as CatalogStatus;
    if (from === status) return before;
    if (!NEXT[from].includes(status)) throw new AppError(400, `Cannot move from ${from} to ${status}`, 'INVALID_STATUS');
    if (status === 'published') d.beforePublish?.(before);
    await sequelize.query(`UPDATE "${d.table}" SET status = :status, updated_at = NOW() WHERE "${d.idColumn}"::text = :id`, {
      replacements: { id, status },
      transaction: t,
    });
    const row = await loadRow(entity, id, t);
    await recordHistory(entity, row, status === 'published' ? 'publish' : status, adminId, t);
    await writeAuditLog({
      action: status === 'published' ? AuditAction.KB_PUBLISH : AuditAction.KB_CHANGE,
      resource: AuditResource.KNOWLEDGE_BASE,
      metadata: { entity, id },
      actorUserId: adminId ?? undefined,
      beforeState: { status: from, version: before.version },
      afterState: { status, version: row.version },
      transaction: t,
    });
    return row;
  });
}

export async function catalogHistory(entity: CatalogEntity, id: string) {
  return sequelize.query<Record<string, unknown>>(
    `SELECT h.id, h.version, h.status, h.action, h.data, h.created_at AS "createdAt", u.email AS "changedBy"
     FROM kb_catalog_history h LEFT JOIN users u ON u.id = h.changed_by
     WHERE h.entity = :entity AND h.entity_id = :id ORDER BY h.created_at DESC LIMIT 100`,
    { type: QueryTypes.SELECT, replacements: { entity, id } }
  );
}
