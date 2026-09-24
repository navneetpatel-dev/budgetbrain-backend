import { QueryTypes } from 'sequelize';
import type { PackKillSwitch } from '@budgetbrain/detection-core';
import { sequelize } from '@database/models';
import { deleteCache, getOrSetCache } from '@core/cache/cache.service';
import { NotFoundError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { activeKillSwitches } from './knowledgeBase.repository';

/**
 * Active kill switches for `/detection/config` (plan T4.6). Cached for a minute, so flipping a
 * switch reaches clients within one config refresh without a database query per request.
 */
const CACHE_KEY = 'kb:kill-switches';
const TTL_SECONDS = 60;

export function getActiveKillSwitches(): Promise<PackKillSwitch[]> {
  return getOrSetCache(CACHE_KEY, TTL_SECONDS, activeKillSwitches);
}

// ---------------------------------------------------------------------------------------------
// Admin console (plan T7.3): list, add, turn on or off. Every change is audited and clears the
// cache, so `/detection/config` serves it on the next request.
// ---------------------------------------------------------------------------------------------

export interface KillSwitchRow {
  id: string;
  scope: PackKillSwitch['scope'];
  key: string;
  action: PackKillSwitch['action'];
  reason: string | null;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const SELECT_ROW = `SELECT k.id, k.scope, k.key, k.action, k.reason, k.active, u.email AS "createdBy",
  k.created_at AS "createdAt", k.updated_at AS "updatedAt"
  FROM kb_kill_switches k LEFT JOIN users u ON u.id = k.created_by`;

export async function listKillSwitches(): Promise<KillSwitchRow[]> {
  return sequelize.query<KillSwitchRow>(`${SELECT_ROW} ORDER BY k.active DESC, k.updated_at DESC`, { type: QueryTypes.SELECT });
}

export async function createKillSwitch(
  input: { scope: PackKillSwitch['scope']; key: string; action: PackKillSwitch['action']; reason: string },
  adminId: string
): Promise<KillSwitchRow> {
  const row = await sequelize.transaction(async (t) => {
    const [created] = await sequelize.query<{ id: string }>(
      `INSERT INTO kb_kill_switches (scope, key, action, reason, active, created_by)
       VALUES (:scope, :key, :action, :reason, TRUE, :adminId) RETURNING id`,
      { type: QueryTypes.SELECT, replacements: { ...input, adminId }, transaction: t }
    );
    await writeAuditLog({
      action: AuditAction.KILL_SWITCH_CHANGE,
      resource: AuditResource.KILL_SWITCH,
      resourceId: created!.id,
      actorUserId: adminId,
      severity: 'warning',
      afterState: { ...input, active: true },
      transaction: t,
    });
    const [full] = await sequelize.query<KillSwitchRow>(`${SELECT_ROW} WHERE k.id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id: created!.id },
      transaction: t,
    });
    return full!;
  });
  await deleteCache(CACHE_KEY);
  return row;
}

export async function setKillSwitchActive(id: string, active: boolean, reason: string | undefined, adminId: string): Promise<KillSwitchRow> {
  const row = await sequelize.transaction(async (t) => {
    const [before] = await sequelize.query<KillSwitchRow>(`${SELECT_ROW} WHERE k.id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id },
      transaction: t,
    });
    if (!before) throw new NotFoundError('Kill switch not found');
    await sequelize.query(
      `UPDATE kb_kill_switches SET active = :active, reason = COALESCE(:reason, reason), updated_at = NOW() WHERE id = :id`,
      { replacements: { id, active, reason: reason ?? null }, transaction: t }
    );
    await writeAuditLog({
      action: AuditAction.KILL_SWITCH_CHANGE,
      resource: AuditResource.KILL_SWITCH,
      resourceId: id,
      actorUserId: adminId,
      severity: 'warning',
      beforeState: { active: before.active },
      afterState: { active, reason: reason ?? before.reason },
      transaction: t,
    });
    const [after] = await sequelize.query<KillSwitchRow>(`${SELECT_ROW} WHERE k.id = :id`, {
      type: QueryTypes.SELECT,
      replacements: { id },
      transaction: t,
    });
    return after!;
  });
  await deleteCache(CACHE_KEY);
  return row;
}
