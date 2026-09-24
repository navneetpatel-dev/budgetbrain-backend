/**
 * Backend performance check for transaction detection (plan §3.2, T9.2). Runs against the
 * database in the environment (never production) and prints a Markdown report:
 *
 *   npm run perf:detection
 *
 * - /sync service time and query count for 100-item batches (p50 / p95 over 30 batches);
 * - sync-state queries cold and cached; pack response queries; dashboard queries;
 * - EXPLAIN ANALYZE of the queries the detection screens and jobs run most.
 *
 * It creates three throw-away users and deletes them (and their rows) at the end.
 */
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { computeFingerprint, parseDecimalToMinor } from '@budgetbrain/detection-core';
import { env } from '@config/env';
import { initModels, sequelize, User } from '@database/models';
import { redis } from '@core/cache/redis.client';
import type { DetectedItemInput } from '@modules/transaction-detection/transactionDetection.types';
import { getSyncState, listPending, syncBatch } from '@modules/transaction-detection/transactionDetection.service';
import { getDetectionDashboard } from '@modules/transaction-detection/detectionAdmin.service';
import { getPackForClient } from '@modules/knowledge-base/packBuilder.service';

const BATCHES = 30;
const BATCH_SIZE = 100;

let queries = 0;
function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number; ms: number }> {
  const options = (sequelize as unknown as { options: { logging: unknown } }).options;
  const previous = options.logging;
  queries = 0;
  options.logging = () => {
    queries += 1;
  };
  const started = performance.now();
  return fn().then(
    (result) => {
      options.logging = previous;
      return { result, queries, ms: performance.now() - started };
    },
    (error) => {
      options.logging = previous;
      throw error;
    }
  );
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

let counter = 0;
function item(userId: string): DetectedItemInput {
  counter += 1;
  const base: DetectedItemInput = {
    clientId: `perf${counter}`,
    amount: `${(counter % 900) + 10}.00`,
    currency: 'INR',
    direction: 'DEBIT',
    transactionType: 'expense',
    subtype: null,
    paymentMethod: 'upi',
    institutionId: 'in.hdfc_bank',
    accountTail: '1234',
    referenceNumber: `PERF${String(counter).padStart(10, '0')}`,
    merchantName: counter % 3 === 0 ? 'Swiggy' : 'Local Store',
    merchantId: null,
    taxonomyCode: null,
    categoryId: null,
    categorySource: null,
    financialAccountId: null,
    transactionDate: new Date().toISOString().slice(0, 10),
    receivedAt: new Date().toISOString(),
    evidence: {
      templateMatched: false,
      institutionVerified: true,
      amountRoleUnique: true,
      directionUnambiguous: true,
      merchantKnown: counter % 2 === 0,
      dateExtracted: true,
      referencePresent: true,
      merchantFuzzy: false,
    },
    confidenceTier: counter % 2 === 0 ? 'high' : 'medium',
    dedupFingerprint: '',
    source: 'android_sms',
  };
  base.dedupFingerprint = computeFingerprint({
    userId,
    institutionId: base.institutionId,
    accountTail: base.accountTail,
    amountMinor: parseDecimalToMinor(base.amount, base.currency),
    currency: base.currency,
    direction: base.direction,
    referenceNumber: base.referenceNumber,
    transactionDate: base.transactionDate,
    receivedAt: base.receivedAt,
  });
  return base;
}

async function explain(label: string, sql: string, replacements: Record<string, unknown>) {
  const rows = await sequelize.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, {
    type: QueryTypes.SELECT,
    replacements,
  });
  const plan = rows.map((r) => r['QUERY PLAN']);
  const time = plan.find((l) => l.startsWith('Execution Time'))?.replace('Execution Time: ', '') ?? '?';
  const scans = plan.filter((l) => /Seq Scan|Index Scan|Index Only Scan|Bitmap Index Scan/.test(l)).map((l) => l.trim().replace(/\s+\(cost.*$/, '').replace(/^->\s*/, ''));
  return `| ${label} | ${time} | ${[...new Set(scans)].join('; ')} |`;
}

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('Never run the perf check against production');
  initModels(sequelize);
  const users = await Promise.all(
    [0, 1, 2].map(() =>
      User.create({
        email: `perf-${randomUUID()}@budgetbrain.test`,
        passwordHash: 'x',
        name: 'Perf',
        currency: 'INR',
        role: 'free',
        authProvider: 'email',
        emailVerified: true,
        onboardingCompleted: true,
      } as never)
    )
  );
  try {
    const out: string[] = [];
    const [{ n: detectedRows }] = await sequelize.query<{ n: string }>(`SELECT count(*) AS n FROM detected_transactions`, { type: QueryTypes.SELECT });
    out.push(`Data: ${detectedRows} detected_transactions rows before the run.`, '');

    // /sync
    const times: number[] = [];
    const counts = new Set<number>();
    for (let i = 0; i < BATCHES; i += 1) {
      const user = users[i % users.length]!;
      const items = Array.from({ length: BATCH_SIZE }, () => item(user.id));
      const run = await countQueries(() => syncBatch(user.id, { items }));
      times.push(run.ms);
      counts.add(run.queries);
    }
    out.push('| Check | Result | Budget |', '|---|---|---|');
    out.push(`| /sync, ${BATCH_SIZE} items (service + DB), p50 / p95 | ${percentile(times, 50).toFixed(0)} ms / ${percentile(times, 95).toFixed(0)} ms | p95 ≤ 300 ms |`);
    out.push(`| /sync queries per batch | ${[...counts].join(', ')} | ≤ 10 (+1 audit row, T7.7) |`);

    // sync-state
    await redis.del(`detect:sync-state:${users[0]!.id}`).catch(() => 0);
    const cold = await countQueries(() => getSyncState(users[0]!.id));
    const warm = await countQueries(() => getSyncState(users[0]!.id));
    out.push(`| sync-state queries, cold / cached | ${cold.queries} / ${warm.queries} | 1 / 0 |`);

    // pack
    await getPackForClient('IN', null);
    const pack = await countQueries(() => getPackForClient('IN', null));
    out.push(`| knowledge-pack response queries (warm) | ${pack.queries} | 0 |`);

    // dashboard
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const dash = await countQueries(() => getDetectionDashboard({ from, to }));
    out.push(`| admin dashboard queries / time | ${dash.queries} / ${dash.ms.toFixed(0)} ms | ≤ 5 |`);

    const pending = await countQueries(() => listPending(users[0]!.id, { limit: 20 }));
    out.push(`| review inbox (pending, 20) queries / time | ${pending.queries} / ${pending.ms.toFixed(0)} ms | — |`);

    out.push('', '| Query | Execution time | Scans |', '|---|---|---|');
    const userId = users[0]!.id;
    out.push(
      await explain(
        'Review inbox page',
        `SELECT id FROM detected_transactions WHERE user_id = :userId AND status = 'pending_review' ORDER BY created_at DESC LIMIT 20`,
        { userId }
      )
    );
    out.push(
      await explain(
        'Detected history page',
        `SELECT id FROM detected_transactions WHERE user_id = :userId ORDER BY transaction_date DESC LIMIT 20`,
        { userId }
      )
    );
    out.push(
      await explain(
        'Sync state',
        `SELECT source, MAX(transaction_date), COUNT(*), COUNT(*) FILTER (WHERE status = 'pending_review') FROM detected_transactions WHERE user_id = :userId GROUP BY source`,
        { userId }
      )
    );
    out.push(
      await explain(
        'Hourly rollup (changed rows since watermark)',
        `SELECT DISTINCT created_at::date FROM detected_transactions WHERE updated_at > NOW() - interval '1 hour'`,
        {}
      )
    );
    out.push(
      await explain(
        'Dashboard: by institution (30 days)',
        `SELECT institution_id, sum(count) FROM detection_daily_stats WHERE day BETWEEN CAST(:from AS date) AND CAST(:to AS date) GROUP BY institution_id ORDER BY 2 DESC LIMIT 15`,
        { from, to }
      )
    );
    out.push(
      await explain(
        'Skeleton queue (k-anonymous groups)',
        `SELECT skeleton_hash, count(DISTINCT user_hash) FROM detection_skeleton_submissions WHERE status = 'new' GROUP BY skeleton_hash HAVING count(DISTINCT user_hash) >= 10 LIMIT 100`,
        {}
      )
    );
    out.push(
      await explain(
        'Diagnostics for a user (14 days)',
        `SELECT * FROM detection_diagnostics_daily WHERE user_id = :userId AND day >= CURRENT_DATE - 14`,
        { userId }
      )
    );
    console.log(out.join('\n'));
  } finally {
    const ids = users.map((u) => u.id);
    await sequelize.query(`DELETE FROM transactions WHERE user_id IN (:ids)`, { replacements: { ids } });
    await sequelize.query(`DELETE FROM detected_transactions WHERE user_id IN (:ids)`, { replacements: { ids } });
    await sequelize.query(`DELETE FROM users WHERE id IN (:ids)`, { replacements: { ids } });
  }
}

main()
  .then(() => sequelize.close())
  .then(() => redis.quit().catch(() => undefined))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
