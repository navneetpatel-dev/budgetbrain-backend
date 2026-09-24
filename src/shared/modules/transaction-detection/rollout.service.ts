import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '@database/models';
import { deleteCache, getOrSetCache } from '@core/cache/cache.service';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';

/**
 * Staged rollout of automatic detection (plan T9.3): internal → 5 % → 25 % → 100 %, per
 * country. A user's bucket (0–99) comes from a hash of their id, so raising the percentage only
 * ever adds users. "Internal" is admin accounts, which get it from the first stage.
 *
 * It gates what the device captures on its own (SMS, notifications) through the config the app
 * reads; pasting a message or importing a file stays available to everyone.
 */

export interface RolloutRow {
  /** Two-letter country, or '' for the default. */
  country: string;
  percent: number;
  includeInternal: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export const ROLLOUT_STAGES = [0, 5, 25, 100] as const;
const CACHE_KEY = 'detection:rollout';
const CACHE_TTL_SECONDS = 60;

export function rolloutBucket(userId: string): number {
  return parseInt(createHash('sha256').update(`detection-rollout:${userId}`).digest('hex').slice(0, 8), 16) % 100;
}

export async function listRollout(): Promise<RolloutRow[]> {
  return sequelize.query<RolloutRow>(
    `SELECT r.country, r.percent, r.include_internal AS "includeInternal", r.note, u.email AS "updatedBy",
            r.updated_at AS "updatedAt"
     FROM detection_rollout r LEFT JOIN users u ON u.id = r.updated_by
     ORDER BY r.country`,
    { type: QueryTypes.SELECT }
  );
}

async function cachedRows(): Promise<Pick<RolloutRow, 'country' | 'percent' | 'includeInternal'>[]> {
  return getOrSetCache(CACHE_KEY, CACHE_TTL_SECONDS, () =>
    sequelize.query<Pick<RolloutRow, 'country' | 'percent' | 'includeInternal'>>(
      `SELECT country, percent, include_internal AS "includeInternal" FROM detection_rollout`,
      { type: QueryTypes.SELECT }
    )
  );
}

type RolloutUser = { id: string; role?: string | null; country?: string | null };

/**
 * The user's country row, else the default row (''); with neither, everyone is in. Internal
 * (admin) accounts are in whenever the row includes them.
 */
export function resolveRollout(rows: Pick<RolloutRow, 'country' | 'percent' | 'includeInternal'>[], user: RolloutUser): boolean {
  const country = (user.country ?? '').trim().toUpperCase();
  const row = rows.find((r) => r.country === country) ?? rows.find((r) => r.country === '');
  if (!row) return true;
  if (row.includeInternal && user.role === 'admin') return true;
  return rolloutBucket(user.id) < row.percent;
}

/** Whether automatic detection is rolled out to this user. */
export async function isInRollout(user: RolloutUser): Promise<boolean> {
  return resolveRollout(await cachedRows(), user);
}

export async function setRollout(
  country: string,
  input: { percent: number; includeInternal?: boolean; note?: string | null },
  adminId: string
): Promise<RolloutRow> {
  const before = (await listRollout()).find((r) => r.country === country) ?? null;
  await sequelize.query(
    `INSERT INTO detection_rollout (country, percent, include_internal, note, updated_by, updated_at)
     VALUES (:country, :percent, :includeInternal, :note, :adminId, NOW())
     ON CONFLICT (country) DO UPDATE SET percent = EXCLUDED.percent, include_internal = EXCLUDED.include_internal,
       note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    {
      replacements: {
        country,
        percent: input.percent,
        includeInternal: input.includeInternal ?? true,
        note: input.note ?? null,
        adminId,
      },
    }
  );
  await deleteCache(CACHE_KEY);
  const after = (await listRollout()).find((r) => r.country === country)!;
  await writeAuditLog({
    action: AuditAction.ROLLOUT_CHANGE,
    resource: AuditResource.KNOWLEDGE_BASE,
    actorUserId: adminId,
    severity: 'warning',
    metadata: { country: country || 'default' },
    beforeState: before ? { percent: before.percent, includeInternal: before.includeInternal } : null,
    afterState: { percent: after.percent, includeInternal: after.includeInternal, note: after.note },
  });
  return after;
}

export async function deleteRollout(country: string, adminId: string): Promise<{ deleted: boolean }> {
  const before = (await listRollout()).find((r) => r.country === country) ?? null;
  if (!before) return { deleted: false };
  await sequelize.query(`DELETE FROM detection_rollout WHERE country = :country`, { replacements: { country } });
  await deleteCache(CACHE_KEY);
  await writeAuditLog({
    action: AuditAction.ROLLOUT_CHANGE,
    resource: AuditResource.KNOWLEDGE_BASE,
    actorUserId: adminId,
    severity: 'warning',
    metadata: { country: country || 'default', removed: true },
    beforeState: { percent: before.percent, includeInternal: before.includeInternal },
  });
  return { deleted: true };
}
