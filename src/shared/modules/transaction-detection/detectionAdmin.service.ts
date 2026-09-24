import { QueryTypes } from 'sequelize';
import { Op } from 'sequelize';
import { AuditLog, DetectedTransaction, MerchantCategoryRule, User, sequelize } from '@database/models';
import { env } from '@config/env';
import { NotFoundError } from '@shared/errors';
import { createLogger } from '@shared/logging';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { listDiagnostics } from './diagnostics.service';
import { countUserSkeletons, userHash } from './skeletons.service';
import { toDetectedDto } from './engine/detectedDto';

const log = createLogger('system');
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------------------------
// Rollups (plan T7.2): the admin dashboard reads detection_daily_stats only.
// ---------------------------------------------------------------------------------------------

/**
 * Recomputes the stats of every day that has a detected row changed since the last run. Rows
 * change status after they are created (confirm, reject, undo), so the watermark is on
 * updated_at, and each affected day is rebuilt whole. A run touches only the changed days.
 */
export async function runDetectionRollup(now: Date = new Date()): Promise<{ days: number }> {
  const [state] = await sequelize.query<{ value: { watermark: string } }>(
    `SELECT value FROM detection_rollup_state WHERE key = 'rollup'`,
    { type: QueryTypes.SELECT }
  );
  const watermark = state?.value.watermark ?? '1970-01-01T00:00:00.000Z';
  // A minute of overlap covers rows committed while the previous run was reading.
  const nextWatermark = new Date(now.getTime() - 60 * 1000).toISOString();

  const days = (
    await sequelize.query<{ day: string }>(
      `SELECT DISTINCT to_char(created_at, 'YYYY-MM-DD') AS day FROM detected_transactions
       WHERE updated_at > :watermark ORDER BY day`,
      { type: QueryTypes.SELECT, replacements: { watermark } }
    )
  ).map((r) => r.day);

  await sequelize.transaction(async (transaction) => {
    if (days.length > 0) {
      await sequelize.query(`DELETE FROM detection_daily_stats WHERE day IN (:days)`, { replacements: { days }, transaction });
      await sequelize.query(
        `INSERT INTO detection_daily_stats (day, country, institution_id, source, status, count, users)
         SELECT d.created_at::date,
                COALESCE(i.country, ''),
                COALESCE(d.institution_id, ''),
                d.source,
                CASE WHEN d.status = 'rejected' AND d.review_reason = 'undone' THEN 'undone' ELSE d.status END,
                count(*),
                count(DISTINCT d.user_id)
         FROM detected_transactions d
         LEFT JOIN kb_institutions i ON i.id = d.institution_id
         WHERE d.created_at >= CAST(:from AS date) AND d.created_at < CAST(:to AS date) + 1
           AND to_char(d.created_at, 'YYYY-MM-DD') IN (:days)
         GROUP BY 1, 2, 3, 4, 5`,
        { replacements: { days, from: days[0], to: days[days.length - 1] }, transaction }
      );
    }
    // Adoption for the dashboard and feature usage: one indexed count per run, not per request.
    const [adoption] = await sequelize.query<{ active: string; template_learning: string; review_all: string }>(
      `SELECT
         (SELECT count(DISTINCT user_id) FROM detected_transactions WHERE created_at >= :since) AS active,
         (SELECT count(*) FROM users WHERE detection_template_learning) AS template_learning,
         (SELECT count(*) FROM users WHERE NOT detection_auto_add) AS review_all`,
      { type: QueryTypes.SELECT, replacements: { since: new Date(now.getTime() - 30 * DAY_MS) }, transaction }
    );
    const value = {
      watermark: nextWatermark,
      activeUsers30d: Number(adoption?.active ?? 0),
      templateLearningUsers: Number(adoption?.template_learning ?? 0),
      reviewAllUsers: Number(adoption?.review_all ?? 0),
      computedAt: now.toISOString(),
    };
    await sequelize.query(
      `INSERT INTO detection_rollup_state (key, value, updated_at) VALUES ('rollup', CAST(:value AS jsonb), NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      { replacements: { value: JSON.stringify(value) }, transaction }
    );
  });
  if (days.length > 0) log.info('Detection rollup', { days: days.length });
  return { days: days.length };
}

export interface AdoptionState {
  activeUsers30d: number;
  templateLearningUsers: number;
  reviewAllUsers: number;
  computedAt: string | null;
}

export async function getAdoption(): Promise<AdoptionState> {
  const [state] = await sequelize.query<{ value: Partial<AdoptionState> }>(
    `SELECT value FROM detection_rollup_state WHERE key = 'rollup'`,
    { type: QueryTypes.SELECT }
  );
  return {
    activeUsers30d: state?.value.activeUsers30d ?? 0,
    templateLearningUsers: state?.value.templateLearningUsers ?? 0,
    reviewAllUsers: state?.value.reviewAllUsers ?? 0,
    computedAt: state?.value.computedAt ?? null,
  };
}

/**
 * The detection dashboard (T7.3): totals, rates, sources, institutions, countries and a daily
 * series, from the rollup table only (five indexed queries on the primary key range).
 */
export async function getDetectionDashboard(range: { from: string; to: string }) {
  const replacements = range;
  const where = `day BETWEEN CAST(:from AS date) AND CAST(:to AS date)`;
  const [byStatus, bySource, byInstitution, byCountry, series, adoption] = await Promise.all([
    sequelize.query<{ status: string; count: string }>(
      `SELECT status, sum(count) AS count FROM detection_daily_stats WHERE ${where} GROUP BY status`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query<{ source: string; count: string }>(
      `SELECT source, sum(count) AS count FROM detection_daily_stats WHERE ${where} GROUP BY source ORDER BY count DESC`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query<{ institution_id: string; name: string | null; count: string; auto: string; review: string; rejected: string }>(
      `SELECT s.institution_id, min(i.display_name) AS name, sum(s.count) AS count,
              sum(s.count) FILTER (WHERE s.status = 'auto_approved') AS auto,
              sum(s.count) FILTER (WHERE s.status = 'pending_review') AS review,
              sum(s.count) FILTER (WHERE s.status IN ('rejected', 'undone')) AS rejected
       FROM detection_daily_stats s LEFT JOIN kb_institutions i ON i.id = NULLIF(s.institution_id, '')
       WHERE ${where} GROUP BY s.institution_id ORDER BY count DESC LIMIT 15`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query<{ country: string; count: string }>(
      `SELECT country, sum(count) AS count FROM detection_daily_stats WHERE ${where} GROUP BY country ORDER BY count DESC`,
      { type: QueryTypes.SELECT, replacements }
    ),
    sequelize.query<{ day: string; status: string; count: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, status, sum(count) AS count FROM detection_daily_stats
       WHERE ${where} GROUP BY day, status ORDER BY day`,
      { type: QueryTypes.SELECT, replacements }
    ),
    getAdoption(),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const rate = (n: number | undefined) => (total > 0 ? Math.round(((n ?? 0) / total) * 1000) / 1000 : 0);
  const days = new Map<string, Record<string, number>>();
  for (const r of series) {
    const row = days.get(r.day) ?? {};
    row[r.status] = Number(r.count);
    days.set(r.day, row);
  }
  return {
    range,
    total,
    counts,
    rates: {
      autoApproved: rate(counts.auto_approved),
      review: rate(counts.pending_review),
      confirmed: rate(counts.user_confirmed),
      rejected: rate(counts.rejected),
      undone: rate(counts.undone),
      duplicate: rate(counts.duplicate),
    },
    bySource: bySource.map((r) => ({ source: r.source, count: Number(r.count) })),
    byInstitution: byInstitution.map((r) => ({
      institutionId: r.institution_id || null,
      name: r.name,
      count: Number(r.count),
      autoApproved: Number(r.auto ?? 0),
      review: Number(r.review ?? 0),
      rejected: Number(r.rejected ?? 0),
    })),
    byCountry: byCountry.map((r) => ({ country: r.country || null, count: Number(r.count) })),
    series: [...days.entries()].map(([day, byDayStatus]) => ({ day, ...byDayStatus })),
    adoption,
  };
}

// ---------------------------------------------------------------------------------------------
// A user's detection tab (T7.3)
// ---------------------------------------------------------------------------------------------

export async function getUserDetection(userId: string) {
  const user = await User.findByPk(userId, { attributes: ['id', 'detectionAutoAdd', 'detectionTemplateLearning'] });
  if (!user) throw new NotFoundError('User not found');
  const [counts, rules, diagnostics, recent, skeletons] = await Promise.all([
    sequelize.query<{ status: string; source: string; count: string }>(
      `SELECT status, source, count(*) AS count FROM detected_transactions WHERE user_id = :userId GROUP BY status, source`,
      { type: QueryTypes.SELECT, replacements: { userId } }
    ),
    sequelize.query<{ merchant: string; category: string | null; updated_at: Date }>(
      `SELECT r.merchant, c.name AS category, r.updated_at FROM merchant_category_rules r
       LEFT JOIN categories c ON c.id = r.category_id WHERE r.user_id = :userId ORDER BY r.updated_at DESC LIMIT 100`,
      { type: QueryTypes.SELECT, replacements: { userId } }
    ),
    listDiagnostics(userId, 14),
    DetectedTransaction.findAll({ where: { userId }, order: [['createdAt', 'DESC']], limit: 20 }),
    countUserSkeletons(userId),
  ]);
  return {
    settings: { autoAddHighConfidence: user.detectionAutoAdd, templateLearning: user.detectionTemplateLearning },
    counts: counts.map((r) => ({ status: r.status, source: r.source, count: Number(r.count) })),
    rules: rules.map((r) => ({ merchant: r.merchant, categoryName: r.category, updatedAt: new Date(r.updated_at).toISOString() })),
    diagnostics,
    recent: recent.map(toDetectedDto),
    skeletonSubmissions: skeletons,
  };
}

// ---------------------------------------------------------------------------------------------
// Alias crowd-learning (T7.5)
// ---------------------------------------------------------------------------------------------

/**
 * Merchant names that at least k users gave a category rule to, and that are no alias yet:
 * candidates for a global alias. The suggestion is the category name most of them chose.
 * Personal rules keep winning over any alias (sync applies user rules last).
 */
export async function listAliasCandidates(limit = 100) {
  const rows = await sequelize.query<{ merchant: string; users: string; top_category: string | null }>(
    `SELECT r.merchant, count(DISTINCT r.user_id) AS users,
            mode() WITHIN GROUP (ORDER BY lower(c.name)) AS top_category
     FROM merchant_category_rules r
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE NOT EXISTS (SELECT 1 FROM kb_merchant_aliases a WHERE a.alias_key = r.merchant)
     GROUP BY r.merchant
     HAVING count(DISTINCT r.user_id) >= :k
     ORDER BY users DESC, r.merchant
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { k: env.DETECTION_K_ANONYMITY, limit } }
  );
  return rows.map((r) => ({ aliasKey: r.merchant, users: Number(r.users), suggestedCategory: r.top_category }));
}

export async function isAliasCandidate(aliasKey: string): Promise<boolean> {
  return (await listAliasCandidates(1000)).some((c) => c.aliasKey === aliasKey);
}

// ---------------------------------------------------------------------------------------------
// Privacy tooling (T7.6)
// ---------------------------------------------------------------------------------------------

/** Everything detection stores about a user, for "download my data". */
export async function exportDetectionData(userId: string) {
  const user = await User.findByPk(userId, { attributes: ['id', 'detectionAutoAdd', 'detectionTemplateLearning'] });
  if (!user) throw new NotFoundError('User not found');
  const [detected, rules, diagnostics] = await Promise.all([
    DetectedTransaction.findAll({ where: { userId }, order: [['createdAt', 'DESC']] }),
    MerchantCategoryRule.findAll({ where: { userId }, attributes: ['merchant', 'categoryId', 'updatedAt'] }),
    listDiagnostics(userId, 400),
  ]);
  const skeletons = await sequelize.query<{ skeleton: string; institution_id: string | null; created_at: Date }>(
    `SELECT skeleton, institution_id, created_at FROM detection_skeleton_submissions WHERE user_hash = :hash ORDER BY created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { hash: userHash(userId) } }
  );
  await writeAuditLog({
    action: AuditAction.DETECTION_EXPORT,
    resource: AuditResource.DETECTED_TRANSACTION,
    resourceId: userId,
    actorUserId: userId,
    afterState: { detected: detected.length, rules: rules.length, diagnostics: diagnostics.length, skeletons: skeletons.length },
  });
  return {
    exportedAt: new Date().toISOString(),
    settings: { autoAddHighConfidence: user.detectionAutoAdd, templateLearning: user.detectionTemplateLearning },
    detectedTransactions: detected.map(toDetectedDto),
    merchantRules: rules.map((r) => ({ merchant: r.merchant, categoryId: r.categoryId, updatedAt: r.updatedAt })),
    diagnostics,
    templateLearningSubmissions: skeletons.map((s) => ({
      skeleton: s.skeleton,
      institutionId: s.institution_id,
      submittedAt: new Date(s.created_at).toISOString(),
    })),
  };
}

export const RETENTION_DAYS = { rejected: 90, diagnostics: 180, handledSkeletons: 30, skeletons: 180 } as const;

/**
 * Retention (T7.6, plan §3.2): rejected, undone and duplicate detections after 90 days,
 * diagnostics after 180, handled skeletons after 30 and any skeleton after 180.
 */
export async function runDetectionRetention(now: Date = new Date()) {
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const detected = await DetectedTransaction.destroy({
    where: {
      status: ['rejected', 'duplicate'],
      createdTransactionId: null,
      updatedAt: { [Op.lt]: before(RETENTION_DAYS.rejected) },
    },
  });
  const [, diag] = await sequelize.query(`DELETE FROM detection_diagnostics_daily WHERE day < CAST(:before AS date)`, {
    replacements: { before: before(RETENTION_DAYS.diagnostics).toISOString().slice(0, 10) },
  });
  const [, skel] = await sequelize.query(
    `DELETE FROM detection_skeleton_submissions
     WHERE (status <> 'new' AND created_at < :handled) OR created_at < :any`,
    { replacements: { handled: before(RETENTION_DAYS.handledSkeletons), any: before(RETENTION_DAYS.skeletons) } }
  );
  const result = {
    detected,
    diagnostics: (diag as { rowCount?: number } | undefined)?.rowCount ?? 0,
    skeletons: (skel as { rowCount?: number } | undefined)?.rowCount ?? 0,
  };
  log.info('Detection retention', result);
  return result;
}

/** Account deletions and "delete my detected data" requests of the last 90 days (admin view). */
export async function listDeletionRequests(limit = 100) {
  const rows = await AuditLog.findAll({
    where: {
      action: [AuditAction.DETECTION_DELETE_ALL, AuditAction.USER_DELETE],
      createdAt: { [Op.gte]: new Date(Date.now() - 90 * DAY_MS) },
    },
    order: [['createdAt', 'DESC']],
    limit,
  });
  return rows.map((r) => {
    const row = r.toJSON() as unknown as Record<string, unknown>;
    return {
      id: row.id,
      action: row.action,
      userId: row.resourceId ?? null,
      createdAt: row.createdAt,
      detail: row.afterState ?? row.metadata ?? null,
    };
  });
}
