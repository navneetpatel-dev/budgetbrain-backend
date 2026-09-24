import { QueryTypes } from 'sequelize';
import { sequelize } from '@database/models';
import type { DiagnosticsUploadInput } from './transactionDetection.types';

/**
 * Detection diagnostics (plan T7.1): each device uploads, once a day, how many messages stopped
 * at each stage and why, per institution. Counts only; no text, amounts or senders. Support reads
 * them as "3 messages from HDFC ignored: otp_marker".
 *
 * A day's counts are replaced, not added, so a re-upload after a retry never double-counts.
 */
export async function saveDiagnostics(userId: string, input: DiagnosticsUploadInput): Promise<{ saved: number }> {
  if (input.rows.length === 0) return { saved: 0 };
  const days = [...new Set(input.rows.map((r) => r.day))];
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`DELETE FROM detection_diagnostics_daily WHERE user_id = :userId AND day IN (:days)`, {
      replacements: { userId, days },
      transaction,
    });
    await sequelize.query(
      `INSERT INTO detection_diagnostics_daily (user_id, day, stage, reason_code, institution_id, count, updated_at)
       SELECT :userId, r.day, r.stage, r.reason_code, r.institution_id, SUM(r.count), NOW()
       FROM jsonb_to_recordset(CAST(:rows AS jsonb))
         AS r(day date, stage text, reason_code text, institution_id text, count int)
       GROUP BY r.day, r.stage, r.reason_code, r.institution_id`,
      {
        replacements: {
          userId,
          rows: JSON.stringify(
            input.rows.map((r) => ({
              day: r.day,
              stage: r.stage,
              reason_code: r.reasonCode,
              institution_id: r.institutionId ?? '',
              count: r.count,
            }))
          ),
        },
        transaction,
      }
    );
  });
  return { saved: input.rows.length };
}

export interface DiagnosticsRow {
  day: string;
  stage: string;
  reasonCode: string;
  institutionId: string | null;
  institutionName: string | null;
  count: number;
}

/** One user's diagnostics for the last `days` days, newest first (admin user tab, T7.3). */
export async function listDiagnostics(userId: string, days = 14): Promise<DiagnosticsRow[]> {
  const rows = await sequelize.query<{
    day: string;
    stage: string;
    reason_code: string;
    institution_id: string;
    name: string | null;
    count: number;
  }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.stage, d.reason_code, d.institution_id, i.display_name AS name, d.count
     FROM detection_diagnostics_daily d
     LEFT JOIN kb_institutions i ON i.id = NULLIF(d.institution_id, '')
     WHERE d.user_id = :userId AND d.day >= CURRENT_DATE - CAST(:days AS int)
     ORDER BY d.day DESC, d.count DESC`,
    { type: QueryTypes.SELECT, replacements: { userId, days } }
  );
  return rows.map((r) => ({
    day: r.day,
    stage: r.stage,
    reasonCode: r.reason_code,
    institutionId: r.institution_id || null,
    institutionName: r.name,
    count: Number(r.count),
  }));
}
