import { createHash, createHmac } from 'crypto';
import { QueryTypes } from 'sequelize';
import { compilePack, type KnowledgePack, type PackTemplate } from '@budgetbrain/detection-core';
import { sequelize, User } from '@database/models';
import { env } from '@config/env';
import { AppError, NotFoundError } from '@shared/errors';
import type { SkeletonUploadInput } from './transactionDetection.types';

/**
 * Template learning (plan T7.4, decision D-5: opt-in, off by default).
 *
 * Devices of users who opted in send message skeletons: masked shapes like
 * `Rs.<AMT> debited from a/c <ACCT> on <DATE>` (core `buildSkeleton`), never text. Each row is
 * keyed by an HMAC of the user id, so the server can count distinct users per shape without
 * storing who sent it. Admins see a shape only once k distinct users sent it; they map its fields
 * and publish it as a template, which must match a sample message first.
 */

export function userHash(userId: string): string {
  return createHmac('sha256', env.DETECTION_HMAC_SECRET ?? env.JWT_ACCESS_SECRET).update(userId).digest('hex');
}

const skeletonHash = (skeleton: string) => createHash('sha256').update(skeleton.toLowerCase()).digest('hex');

/**
 * Stores a user's shapes once each. A later upload of the same shape that names a corrected
 * field (the user fixed what the parser read from it, plan T7.4) records that field.
 */
export async function submitSkeletons(userId: string, input: SkeletonUploadInput): Promise<{ accepted: number }> {
  const user = await User.findByPk(userId, { attributes: ['id', 'detectionTemplateLearning'] });
  if (!user?.detectionTemplateLearning) {
    throw new AppError(403, 'Template learning is turned off for this account', 'TEMPLATE_LEARNING_OFF');
  }
  const hashOfUser = userHash(userId);
  // The server hashes the skeleton itself, like fingerprints: a client can't choose its group.
  const all = input.items.map((item) => ({
    skeleton_hash: skeletonHash(item.skeleton),
    user_hash: hashOfUser,
    institution_id: item.institutionId,
    sender_key: item.senderKey,
    country: item.country ?? '',
    language: item.language,
    skeleton: item.skeleton,
    corrected_field: item.correctedField,
  }));
  // One row per shape (an upsert can't touch the same row twice); a row naming a correction wins.
  const byHash = new Map<string, (typeof all)[number]>();
  for (const row of all) {
    const seen = byHash.get(row.skeleton_hash);
    if (!seen || (!seen.corrected_field && row.corrected_field)) byHash.set(row.skeleton_hash, row);
  }
  const rows = [...byHash.values()];
  const inserted = await sequelize.query<{ id: string }>(
    `INSERT INTO detection_skeleton_submissions
       (skeleton_hash, user_hash, institution_id, sender_key, country, language, skeleton, corrected_field)
     SELECT r.skeleton_hash, r.user_hash, r.institution_id, r.sender_key, r.country, r.language, r.skeleton, r.corrected_field
     FROM jsonb_to_recordset(CAST(:rows AS jsonb)) AS r(skeleton_hash text, user_hash text, institution_id text,
       sender_key text, country text, language text, skeleton text, corrected_field text)
     ON CONFLICT (skeleton_hash, user_hash) DO UPDATE SET corrected_field = EXCLUDED.corrected_field
       WHERE EXCLUDED.corrected_field IS NOT NULL
         AND detection_skeleton_submissions.corrected_field IS DISTINCT FROM EXCLUDED.corrected_field
     RETURNING id`,
    { type: QueryTypes.SELECT, replacements: { rows: JSON.stringify(rows) } }
  );
  return { accepted: inserted.length };
}

/** Removes every skeleton a user sent (opt-out, account deletion). */
export async function deleteUserSkeletons(userId: string): Promise<number> {
  const [, result] = await sequelize.query(`DELETE FROM detection_skeleton_submissions WHERE user_hash = :hash`, {
    replacements: { hash: userHash(userId) },
  });
  return (result as { rowCount?: number } | undefined)?.rowCount ?? 0;
}

export async function countUserSkeletons(userId: string): Promise<number> {
  const [row] = await sequelize.query<{ n: string }>(
    `SELECT count(*) AS n FROM detection_skeleton_submissions WHERE user_hash = :hash`,
    { type: QueryTypes.SELECT, replacements: { hash: userHash(userId) } }
  );
  return Number(row?.n ?? 0);
}

export interface SkeletonGroup {
  skeletonHash: string;
  skeleton: string;
  institutionId: string | null;
  institutionName: string | null;
  country: string;
  users: number;
  correctedFields: string[];
  lastSeenAt: string;
}

/**
 * The "unrecognised shapes" queue (T7.4): shapes that at least k distinct users sent and that
 * nobody handled yet. Groups below k are never returned, whatever the filters.
 */
export async function listSkeletonQueue(limit = 100): Promise<SkeletonGroup[]> {
  const rows = await sequelize.query<{
    skeleton_hash: string;
    skeleton: string;
    institution_id: string | null;
    name: string | null;
    country: string;
    users: string;
    corrected: string[] | null;
    last_seen: Date;
  }>(
    `SELECT s.skeleton_hash, min(s.skeleton) AS skeleton, s.institution_id, min(i.display_name) AS name, min(s.country) AS country,
            count(DISTINCT s.user_hash) AS users,
            array_remove(array_agg(DISTINCT s.corrected_field), NULL) AS corrected,
            max(s.created_at) AS last_seen
     FROM detection_skeleton_submissions s
     LEFT JOIN kb_institutions i ON i.id = s.institution_id
     WHERE s.status = 'new'
     GROUP BY s.skeleton_hash, s.institution_id
     HAVING count(DISTINCT s.user_hash) >= :k
     ORDER BY users DESC, last_seen DESC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { k: env.DETECTION_K_ANONYMITY, limit } }
  );
  return rows.map((r) => ({
    skeletonHash: r.skeleton_hash,
    skeleton: r.skeleton,
    institutionId: r.institution_id,
    institutionName: r.name,
    country: r.country,
    users: Number(r.users),
    correctedFields: r.corrected ?? [],
    lastSeenAt: new Date(r.last_seen).toISOString(),
  }));
}

async function requireVisibleGroup(hash: string): Promise<SkeletonGroup> {
  const group = (await listSkeletonQueue(1000)).find((g) => g.skeletonHash === hash);
  // Below k the group doesn't exist as far as admins are concerned.
  if (!group) throw new NotFoundError('Skeleton not found');
  return group;
}

export interface TemplateFromSkeletonInput {
  id: string;
  institutionId: string;
  language: string;
  fields: PackTemplate['fields'];
  direction: PackTemplate['direction'];
  transactionType: PackTemplate['transactionType'];
  subtype?: PackTemplate['subtype'];
  paymentMethod?: PackTemplate['paymentMethod'];
  dateOrder?: PackTemplate['dateOrder'];
  /** A synthetic example the template must match; no real message text. */
  sample: string;
}

/**
 * Checks a template against core before it is stored: it must compile, its field list must fit
 * its placeholders, and it must match the sample message (plan T7.4, "corpus sample required").
 */
export function checkTemplate(template: PackTemplate, sample: string): void {
  const placeholders = [...template.skeleton.matchAll(/<([A-Z]+)>/g)].length;
  if (template.fields.length !== placeholders) {
    throw new AppError(400, `The skeleton has ${placeholders} placeholders but ${template.fields.length} fields were mapped`, 'TEMPLATE_FIELDS');
  }
  const pack = compilePack({
    meta: { schemaVersion: 1, packVersion: 1, country: 'ZZ', generatedAt: new Date(0).toISOString(), minCoreVersion: '0.6.0' },
    institutions: [{ id: template.institutionId, name: 'x', displayName: 'x', country: 'ZZ', type: 'bank', verified: false }],
    senders: [],
    lexicons: [],
    templates: [template],
    merchants: [],
    merchantAliases: [],
    currencies: [],
    paymentRails: [],
    taxonomy: [],
    mcc: [],
    killSwitches: [],
  } as unknown as KnowledgePack);
  const compiled = pack.templatesByInstitution.get(template.institutionId)?.[0];
  if (!compiled) throw new AppError(400, 'The skeleton does not compile as a template', 'TEMPLATE_INVALID');
  if (!compiled.regex.test(sample.replace(/\s+/g, ' ').trim())) {
    throw new AppError(400, 'The sample message does not match the template', 'TEMPLATE_SAMPLE_MISMATCH');
  }
}

/** Publishes nothing: creates a draft template from a visible shape and marks the shape handled. */
export async function createTemplateFromSkeleton(
  hash: string,
  input: TemplateFromSkeletonInput,
  createTemplate: (template: PackTemplate & { sample: string }) => Promise<unknown>
): Promise<unknown> {
  const group = await requireVisibleGroup(hash);
  const template: PackTemplate = {
    id: input.id,
    institutionId: input.institutionId,
    version: 1,
    language: input.language,
    skeleton: group.skeleton,
    fields: input.fields,
    direction: input.direction,
    transactionType: input.transactionType,
    ...(input.subtype ? { subtype: input.subtype } : {}),
    ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
    ...(input.dateOrder ? { dateOrder: input.dateOrder } : {}),
  };
  checkTemplate(template, input.sample);
  const created = await createTemplate({ ...template, sample: input.sample });
  await sequelize.query(`UPDATE detection_skeleton_submissions SET status = 'templated' WHERE skeleton_hash = :hash`, {
    replacements: { hash },
  });
  return created;
}

export async function dismissSkeleton(hash: string): Promise<void> {
  await requireVisibleGroup(hash);
  await sequelize.query(`UPDATE detection_skeleton_submissions SET status = 'dismissed' WHERE skeleton_hash = :hash`, {
    replacements: { hash },
  });
}
