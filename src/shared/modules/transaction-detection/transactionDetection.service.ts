import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { getActiveKillSwitches } from '@modules/knowledge-base/killSwitches.service';
import { minTier, scoreEvidence, isAllowedDirectionType, type ConfidenceTier, type SyncItemResult } from '@budgetbrain/detection-core';
import {
  sequelize,
  Category,
  DetectedTransaction,
  FinancialAccount,
  MerchantCategoryRule,
  User,
} from '@database/models';
import { env } from '@config/env';
import { deleteCache, getCache, setCache } from '@core/cache/cache.service';
import { redis } from '@core/cache/redis.client';
import { AppError, NotFoundError, ValidationError } from '@shared/errors';
import { writeAuditLog, AuditAction, AuditResource } from '@shared/audit/index';
import { createLogger } from '@shared/logging';
import { upsertMerchantCategoryRule } from '@shared/modules/categories/service/merchantMemory.service';
import {
  createTransaction,
  createTransactionsBulk,
  deleteTransaction,
  type BulkCreateTransactionItem,
} from '@shared/modules/expenses/service/expenses.service';
import {
  DETECTION_LIMITS,
  DETECTION_STATUS,
  ERROR_MESSAGES,
  REVIEW_REASONS,
  SUBTYPES_BY_TYPE,
} from './transactionDetection.constants';
import type {
  ConfirmDetectedTransactionInput,
  DetectedItemInput,
  DetectedTransactionDto,
  DetectionConfigResponse,
  DetectionSettingsInput,
  ListDetectedQuery,
  MerchantRuleInput,
  SyncDetectedBatchRequest,
  SyncDetectedBatchResponse,
  SyncStateResponse,
} from './transactionDetection.types';
import { validateServerDetectedPayload } from './engine/serverValidation.engine';
import { computeServerFingerprint } from './engine/serverDeduplication.engine';
import { toDetectedDto } from './engine/detectedDto';

const log = createLogger('system');

const syncStateKey = (userId: string) => `detect:sync-state:${userId}`;
const dailyQuotaKey = (userId: string, day: string) => `detect:daily:${userId}:${day}`;

/**
 * Reserves `count` items of the user's daily allowance (plan T1.7). Over the limit, the
 * reservation is returned and the request is refused with 429. Like the rest of the cache
 * layer this fails open: a Redis outage never blocks syncing.
 */
async function reserveDailyQuota(userId: string, count: number): Promise<void> {
  const key = dailyQuotaKey(userId, new Date().toISOString().slice(0, 10));
  let used: number;
  try {
    used = await redis.incrby(key, count);
    if (used === count) await redis.expire(key, 2 * 24 * 60 * 60);
  } catch (err) {
    log.warn('Detection daily quota check skipped', { message: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (used > DETECTION_LIMITS.MAX_ITEMS_PER_DAY) {
    await redis.decrby(key, count).catch(() => undefined);
    throw new AppError(429, ERROR_MESSAGES.DAILY_LIMIT, 'DETECTION_DAILY_LIMIT');
  }
}
const idempotencyKey = (userId: string, key: string) => `detect:idem:${userId}:${key}`;

/** Legacy numeric column kept for old readers; the tier is the source of truth. */
const TIER_SCORE: Record<ConfidenceTier, number> = { high: 0.9, medium: 0.6, low: 0.3 };

function normalizeMerchantKey(merchant: string): string {
  return merchant.trim().toLowerCase();
}

function detectionIncludes() {
  return [
    { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
    { model: FinancialAccount, as: 'financialAccount', attributes: ['id', 'name', 'type'] },
  ];
}

// ---------------------------------------------------------------------------------------------
// Config and settings (plan tasks T1.16, T1.5)
// ---------------------------------------------------------------------------------------------

export async function getDetectionConfig(userId: string): Promise<DetectionConfigResponse> {
  const user = await User.findByPk(userId, { attributes: ['id', 'detectionAutoAdd'] });
  return {
    enabled: env.DETECTION_ENABLED === 'true',
    autoCreateEnabled: env.DETECTION_AUTO_CREATE_ENABLED === 'true',
    minAppVersion: env.DETECTION_MIN_APP_VERSION ?? null,
    autoAddHighConfidence: user?.detectionAutoAdd ?? true,
    // Per institution, template, country, pack and app version (plan T4.6); applied by core.
    killSwitches: await getActiveKillSwitches(),
  };
}

export async function updateDetectionSettings(
  userId: string,
  input: DetectionSettingsInput
): Promise<DetectionConfigResponse> {
  await User.update({ detectionAutoAdd: input.autoAddHighConfidence }, { where: { id: userId } });
  return getDetectionConfig(userId);
}

// ---------------------------------------------------------------------------------------------
// Sync state (plan task T1.11)
// ---------------------------------------------------------------------------------------------

export async function getSyncState(userId: string): Promise<SyncStateResponse> {
  const cached = await getCache<SyncStateResponse>(syncStateKey(userId));
  if (cached) return cached;

  // One pass over the user's rows, per source; the totals are the sum of the sources.
  const rows = await sequelize.query<{ source: string; latest: string | null; total: string; pending: string; last_at: string }>(
    `SELECT source,
            MAX(transaction_date)::text AS latest,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'pending_review') AS pending,
            MAX(created_at) AS last_at
     FROM detected_transactions
     WHERE user_id = :userId
     GROUP BY source`,
    { replacements: { userId }, type: QueryTypes.SELECT }
  );
  const latest = rows.reduce<string | null>((max, r) => (r.latest && (!max || r.latest > max) ? r.latest : max), null);
  const state: SyncStateResponse = {
    latestSyncedTransactionDate: latest,
    totalDetectedCount: rows.reduce((sum, r) => sum + Number(r.total), 0),
    pendingReviewCount: rows.reduce((sum, r) => sum + Number(r.pending), 0),
    sources: rows
      .map((r) => ({ source: r.source, count: Number(r.total), lastReceivedAt: new Date(r.last_at).toISOString() }))
      .sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt)),
  };
  await setCache(syncStateKey(userId), state, DETECTION_LIMITS.SYNC_STATE_CACHE_SECONDS);
  return state;
}

// ---------------------------------------------------------------------------------------------
// Batch sync (plan tasks T1.3–T1.7, T1.9)
// ---------------------------------------------------------------------------------------------

interface PreparedItem {
  index: number;
  item: DetectedItemInput;
  fingerprint: string;
  tier: ConfidenceTier;
  categoryId: string | null;
  status: 'auto_approved' | 'pending_review';
  reviewReason: string | null;
}

/**
 * Stores a batch of detected transactions and creates the ones that may be added
 * automatically. The server:
 * - validates every item itself (types, currency precision, date window);
 * - recomputes the fingerprint and the confidence tier instead of trusting the client;
 * - checks category/account ownership and applies the user's merchant rules;
 * - de-duplicates with INSERT … ON CONFLICT DO NOTHING, so concurrent syncs can't race;
 * - creates transactions through the normal service path (balances, budgets, audit).
 *
 * Query count is constant per batch (plan §3.2). Replaying the same batch, with or without an
 * Idempotency-Key, returns `already_synced` for every item instead of creating anything twice.
 */
export async function syncBatch(
  userId: string,
  request: SyncDetectedBatchRequest,
  options: {
    idempotencyKey?: string;
    /**
     * A statement import the user previewed and committed (plan T6.5): rows are added unless
     * they look like a transaction already in the ledger (`reviewIndexes`), older dates are
     * accepted, and the daily device quota doesn't apply (imports have their own limits).
     */
    import?: { reviewIndexes: ReadonlySet<number> };
  } = {}
): Promise<SyncDetectedBatchResponse> {
  if (options.idempotencyKey) {
    const cached = await getCache<SyncDetectedBatchResponse>(idempotencyKey(userId, options.idempotencyKey));
    if (cached) return cached;
  }
  if (env.DETECTION_ENABLED !== 'true') {
    throw new AppError(503, ERROR_MESSAGES.DETECTION_DISABLED, 'DETECTION_DISABLED');
  }
  if (!options.import) await reserveDailyQuota(userId, request.items.length);

  const items = request.items;
  const results: SyncItemResult[] = new Array(items.length);
  const fail = (index: number, error: string) => {
    const item = items[index];
    results[index] = { clientId: item.clientId, fingerprint: item.dedupFingerprint, status: 'validation_error', error };
  };

  const user = await User.findByPk(userId, { attributes: ['id', 'detectionAutoAdd'] });
  if (!user) throw new NotFoundError('User not found');
  const serverAutoCreate = env.DETECTION_AUTO_CREATE_ENABLED === 'true';
  const autoCreateAllowed = serverAutoCreate && user.detectionAutoAdd;

  // 1. Per-item validation, server fingerprint and server tier.
  let fingerprintMismatches = 0;
  let prepared: PreparedItem[] = [];
  items.forEach((item, index) => {
    const validation = validateServerDetectedPayload(item, undefined, {
      maxAgeDays: options.import ? DETECTION_LIMITS.MAX_IMPORT_AGE_DAYS : DETECTION_LIMITS.MAX_AGE_DAYS,
    });
    if (!validation.isValid || validation.amountMinor === undefined) {
      fail(index, validation.error ?? ERROR_MESSAGES.INVALID_AMOUNT);
      return;
    }
    const fingerprint = computeServerFingerprint(userId, item, validation.amountMinor);
    if (fingerprint !== item.dedupFingerprint) fingerprintMismatches += 1;
    prepared.push({
      index,
      item,
      fingerprint,
      // A bank can't be "verified" when the client didn't even say which bank it is.
      tier: options.import
        ? 'high'
        : minTier(
            item.confidenceTier,
            scoreEvidence(item.institutionId ? item.evidence : { ...item.evidence, institutionVerified: false })
          ),
      categoryId: item.categoryId,
      status: 'pending_review',
      reviewReason: null,
    });
  });

  // 2. Ownership: one query each for categories and accounts in the batch.
  const categoryIds = [...new Set(prepared.map((p) => p.item.categoryId).filter((id): id is string => !!id))];
  const accountIds = [...new Set(prepared.map((p) => p.item.financialAccountId).filter((id): id is string => !!id))];
  const [ownedCategories, ownedAccounts] = await Promise.all([
    categoryIds.length ? Category.findAll({ where: { id: categoryIds, userId }, attributes: ['id'] }) : [],
    accountIds.length ? FinancialAccount.findAll({ where: { id: accountIds, userId }, attributes: ['id'] }) : [],
  ]);
  const ownedCategorySet = new Set(ownedCategories.map((c) => c.id));
  const ownedAccountSet = new Set(ownedAccounts.map((a) => a.id));
  prepared = prepared.filter((p) => {
    if (p.item.categoryId && !ownedCategorySet.has(p.item.categoryId)) {
      fail(p.index, ERROR_MESSAGES.CATEGORY_NOT_FOUND);
      return false;
    }
    if (p.item.financialAccountId && !ownedAccountSet.has(p.item.financialAccountId)) {
      fail(p.index, ERROR_MESSAGES.ACCOUNT_NOT_FOUND);
      return false;
    }
    return true;
  });

  // 3. User merchant rules beat catalog/context categories unless the user picked this one (gap L1).
  const ruleKeys = [
    ...new Set(
      prepared
        .filter((p) => p.item.merchantName && p.item.categorySource !== 'user')
        .map((p) => normalizeMerchantKey(p.item.merchantName!))
        .filter(Boolean)
    ),
  ];
  if (ruleKeys.length > 0) {
    const rules = await MerchantCategoryRule.findAll({
      where: { userId, merchant: ruleKeys },
      attributes: ['merchant', 'categoryId'],
    });
    const categoryByKey = new Map(rules.map((r) => [r.merchant, r.categoryId]));
    for (const p of prepared) {
      if (!p.item.merchantName || p.item.categorySource === 'user') continue;
      const ruleCategory = categoryByKey.get(normalizeMerchantKey(p.item.merchantName));
      if (ruleCategory) p.categoryId = ruleCategory;
    }
  }
  for (const p of prepared) {
    // Transfers carry no spending category.
    if (p.item.transactionType === 'transfer') p.categoryId = null;
  }

  // 4. Decide what may be added automatically.
  for (const p of prepared) {
    if (options.import) {
      const review = options.import.reviewIndexes.has(p.index);
      p.status = review || !serverAutoCreate ? 'pending_review' : 'auto_approved';
      p.reviewReason = review
        ? REVIEW_REASONS.POSSIBLE_DUPLICATE
        : !serverAutoCreate
          ? REVIEW_REASONS.AUTO_CREATE_DISABLED
          : null;
      continue;
    }
    if (p.tier === 'high' && autoCreateAllowed) {
      p.status = 'auto_approved';
    } else {
      p.status = 'pending_review';
      p.reviewReason =
        p.tier === 'low'
          ? REVIEW_REASONS.LOW_CONFIDENCE
          : p.tier === 'medium'
            ? REVIEW_REASONS.MEDIUM_CONFIDENCE
            : !serverAutoCreate
              ? REVIEW_REASONS.AUTO_CREATE_DISABLED
              : REVIEW_REASONS.USER_REVIEWS_ALL;
    }
  }

  // The same transaction twice in one batch: store it once, report the repeat as already synced.
  const firstByFingerprint = new Map<string, PreparedItem>();
  const repeats: PreparedItem[] = [];
  for (const p of prepared) {
    if (firstByFingerprint.has(p.fingerprint)) repeats.push(p);
    else firstByFingerprint.set(p.fingerprint, p);
  }
  const unique = [...firstByFingerprint.values()];

  let createdCount = 0;
  let needsReviewCount = 0;
  let alreadySyncedCount = 0;

  await sequelize.transaction(async (t) => {
    // 5. Insert detected rows; the unique index decides what is new.
    const insertedIds = new Map<string, string>();
    if (unique.length > 0) {
      const replacements: Record<string, unknown> = { userId };
      const now = new Date();
      const tuples = unique.map((p, i) => {
        const id = randomUUID();
        const it = p.item;
        Object.assign(replacements, {
          [`id${i}`]: id,
          [`amount${i}`]: it.amount,
          [`currency${i}`]: it.currency,
          [`direction${i}`]: it.direction,
          [`type${i}`]: it.transactionType,
          [`merchant${i}`]: it.merchantName,
          [`category${i}`]: p.categoryId,
          [`account${i}`]: it.financialAccountId,
          [`tail${i}`]: it.accountTail,
          [`ref${i}`]: it.referenceNumber,
          [`institution${i}`]: it.institutionId,
          [`date${i}`]: it.transactionDate,
          [`confidence${i}`]: TIER_SCORE[p.tier],
          [`fp${i}`]: p.fingerprint,
          [`source${i}`]: it.source,
          [`status${i}`]: p.status,
          [`subtype${i}`]: it.subtype,
          [`pm${i}`]: it.paymentMethod,
          [`reason${i}`]: p.reviewReason,
          [`evidence${i}`]: JSON.stringify(it.evidence),
          [`tier${i}`]: p.tier,
          [`now${i}`]: now,
        });
        return `(CAST(:id${i} AS uuid), :userId, CAST(:amount${i} AS numeric), :currency${i}, :direction${i}, :type${i},
          :merchant${i}, :merchant${i}, CAST(:category${i} AS uuid), CAST(:account${i} AS uuid), :tail${i}, :ref${i},
          :institution${i}, CAST(:date${i} AS date), :confidence${i}, :fp${i}, :source${i}, :status${i}, :subtype${i},
          :pm${i}, :reason${i}, CAST(:evidence${i} AS jsonb), :tier${i}, :now${i}, :now${i})`;
      });
      const inserted = await sequelize.query<{ id: string; dedup_fingerprint: string }>(
        `INSERT INTO detected_transactions
           (id, user_id, amount, currency, direction, transaction_type, merchant, normalized_merchant,
            category_id, financial_account_id, account_tail, reference_number, institution_id,
            transaction_date, confidence, dedup_fingerprint, source, status, subtype, payment_method,
            review_reason, evidence, confidence_tier, created_at, updated_at)
         VALUES ${tuples.join(',\n')}
         ON CONFLICT (user_id, dedup_fingerprint) DO NOTHING
         RETURNING id, dedup_fingerprint`,
        { replacements, transaction: t, type: QueryTypes.SELECT }
      );
      for (const row of inserted) insertedIds.set(row.dedup_fingerprint, row.id);
    }

    // 6. Everything not inserted already exists: look the existing rows up in one query.
    const existingFingerprints = [
      ...unique.filter((p) => !insertedIds.has(p.fingerprint)).map((p) => p.fingerprint),
      ...repeats.map((p) => p.fingerprint),
    ];
    const existing = existingFingerprints.length
      ? await DetectedTransaction.findAll({
          where: { userId, dedupFingerprint: [...new Set(existingFingerprints)] },
          attributes: ['id', 'dedupFingerprint', 'createdTransactionId'],
          transaction: t,
        })
      : [];
    const existingByFingerprint = new Map(existing.map((row) => [row.dedupFingerprint, row]));

    // 7. Create transactions for the new auto-approved rows through the normal service path.
    const toCreate = unique.filter((p) => p.status === 'auto_approved' && insertedIds.has(p.fingerprint));
    const created = await createTransactionsBulk(
      userId,
      toCreate.map(
        (p): BulkCreateTransactionItem => ({
          type: p.item.transactionType,
          amount: Number(p.item.amount),
          currency: p.item.currency,
          date: p.item.transactionDate,
          categoryId: p.categoryId,
          financialAccountId: p.item.financialAccountId,
          merchant: p.item.merchantName,
          notes: null,
          paymentMethod: p.item.paymentMethod,
          tags: ['auto-detected', p.item.source, ...(p.item.subtype ? [p.item.subtype] : [])],
          subtype: p.item.subtype,
          direction: p.item.transactionType === 'transfer' ? p.item.direction : null,
          detectedTransactionId: insertedIds.get(p.fingerprint)!,
        })
      ),
      { transaction: t, source: 'detected' }
    );
    const transactionIdByDetectedId = new Map(created.map((row) => [row.detectedTransactionId!, row.id]));

    if (created.length > 0) {
      const replacements: Record<string, unknown> = { userId };
      const values = created.map((row, i) => {
        replacements[`d${i}`] = row.detectedTransactionId;
        replacements[`t${i}`] = row.id;
        return `(CAST(:d${i} AS uuid), CAST(:t${i} AS uuid))`;
      });
      await sequelize.query(
        `UPDATE detected_transactions AS d SET created_transaction_id = v.tx_id, updated_at = NOW()
         FROM (VALUES ${values.join(', ')}) AS v(id, tx_id)
         WHERE d.id = v.id AND d.user_id = :userId`,
        { replacements, transaction: t }
      );
    }

    // 8. One result per submitted item.
    for (const p of unique) {
      const detectedId = insertedIds.get(p.fingerprint);
      if (detectedId) {
        const transactionId = transactionIdByDetectedId.get(detectedId) ?? null;
        if (p.status === 'auto_approved') createdCount += 1;
        else needsReviewCount += 1;
        results[p.index] = {
          clientId: p.item.clientId,
          fingerprint: p.fingerprint,
          status: p.status === 'auto_approved' ? 'created' : 'needs_review',
          detectedId,
          transactionId,
        };
      }
    }
    for (const p of [...unique.filter((u) => !insertedIds.has(u.fingerprint)), ...repeats]) {
      const row = existingByFingerprint.get(p.fingerprint) ?? null;
      alreadySyncedCount += 1;
      results[p.index] = {
        clientId: p.item.clientId,
        fingerprint: p.fingerprint,
        status: 'already_synced',
        ...(row ? { detectedId: row.id, transactionId: row.createdTransactionId } : {}),
      };
    }
  });

  if (fingerprintMismatches > 0) {
    // Counts only: never log message content or amounts (spec §22).
    log.warn('Detection fingerprint mismatch', { userId, mismatches: fingerprintMismatches, items: items.length });
  }

  const response: SyncDetectedBatchResponse = {
    totalProcessed: items.length,
    createdCount,
    needsReviewCount,
    alreadySyncedCount,
    failedCount: results.filter((r) => r.status === 'validation_error').length,
    results,
  };

  await deleteCache(syncStateKey(userId));
  if (options.idempotencyKey) {
    await setCache(idempotencyKey(userId, options.idempotencyKey), response, DETECTION_LIMITS.IDEMPOTENCY_CACHE_SECONDS);
  }
  return response;
}

// ---------------------------------------------------------------------------------------------
// Lists (plan tasks T1.10, T5.5)
// ---------------------------------------------------------------------------------------------

export async function listPending(
  userId: string,
  pagination: { limit?: number; offset?: number } = {}
): Promise<{ rows: DetectedTransactionDto[]; count: number }> {
  return listDetected(userId, { status: DETECTION_STATUS.PENDING_REVIEW }, pagination);
}

export async function listDetected(
  userId: string,
  filters: Pick<ListDetectedQuery, 'status' | 'source'>,
  pagination: { limit?: number; offset?: number } = {}
): Promise<{ rows: DetectedTransactionDto[]; count: number }> {
  const limit = Math.min(pagination.limit ?? 20, 100);
  const offset = pagination.offset ?? 0;
  const where: Record<string, unknown> = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.source) where.source = filters.source;

  const { rows, count } = await DetectedTransaction.findAndCountAll({
    where,
    order: [
      ['transactionDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
    offset,
    include: detectionIncludes(),
  });
  return { rows: rows.map(toDetectedDto), count };
}

// ---------------------------------------------------------------------------------------------
// Review actions (plan tasks T1.8, T5.2)
// ---------------------------------------------------------------------------------------------

async function lockOwned(userId: string, id: string, t: import('sequelize').Transaction): Promise<DetectedTransaction> {
  const detected = await DetectedTransaction.findOne({ where: { id, userId }, lock: t.LOCK.UPDATE, transaction: t });
  if (!detected) throw new NotFoundError(ERROR_MESSAGES.DETECTION_NOT_FOUND);
  return detected;
}

/** One of the user's detected transactions. */
export async function getDetected(userId: string, id: string): Promise<DetectedTransactionDto> {
  const row = await DetectedTransaction.findOne({ where: { id, userId }, include: detectionIncludes() });
  if (!row) throw new NotFoundError(ERROR_MESSAGES.DETECTION_NOT_FOUND);
  return toDetectedDto(row);
}

async function reloadDto(id: string, t?: import('sequelize').Transaction): Promise<DetectedTransactionDto> {
  const row = await DetectedTransaction.findByPk(id, { include: detectionIncludes(), transaction: t });
  if (!row) throw new NotFoundError(ERROR_MESSAGES.DETECTION_NOT_FOUND);
  return toDetectedDto(row);
}

export async function confirmPending(
  userId: string,
  id: string,
  input: ConfirmDetectedTransactionInput
): Promise<DetectedTransactionDto> {
  const result = await sequelize.transaction(async (t) => {
    const detected = await lockOwned(userId, id, t);
    if (detected.status !== DETECTION_STATUS.PENDING_REVIEW) {
      throw new ValidationError(ERROR_MESSAGES.ALREADY_PROCESSED);
    }

    const type = input.transactionType ?? detected.transactionType;
    if (!isAllowedDirectionType(detected.direction, type)) {
      throw new ValidationError(ERROR_MESSAGES.DIRECTION_TYPE_MISMATCH);
    }
    const subtype = input.subtype !== undefined ? input.subtype : (detected.subtype as ConfirmDetectedTransactionInput['subtype']);
    if (subtype && !(SUBTYPES_BY_TYPE[type] ?? []).includes(subtype)) {
      throw new ValidationError(ERROR_MESSAGES.SUBTYPE_MISMATCH);
    }

    const categoryId = type === 'transfer' ? null : input.categoryId !== undefined ? input.categoryId : detected.categoryId;
    if (categoryId) {
      const owned = await Category.findOne({ where: { id: categoryId, userId }, attributes: ['id'], transaction: t });
      if (!owned) throw new NotFoundError(ERROR_MESSAGES.CATEGORY_NOT_FOUND);
    }
    const financialAccountId =
      input.financialAccountId !== undefined ? input.financialAccountId : detected.financialAccountId;
    const merchant = input.merchant || detected.normalizedMerchant || detected.merchant;

    // Learn only from a real correction (gap L3, plan T5.2): the user picked another category, or
    // renamed the merchant, for an expense. Confirming as detected teaches nothing. The rule uses
    // the same normalized key manual entries use (gap L6), and this is the only write path.
    const categoryChanged = input.categoryId !== undefined && input.categoryId !== detected.categoryId;
    const detectedMerchant = detected.normalizedMerchant || detected.merchant;
    const merchantChanged =
      Boolean(input.merchant) && normalizeMerchantKey(input.merchant!) !== normalizeMerchantKey(detectedMerchant ?? '');
    if (input.learnMerchantCategory !== false && (categoryChanged || merchantChanged) && categoryId && merchant && type === 'expense') {
      await upsertMerchantCategoryRule(userId, merchant, categoryId, t);
    }

    const created = await createTransaction(
      userId,
      {
        type,
        amount: Number(detected.amount),
        currency: detected.currency,
        date: String(detected.transactionDate).slice(0, 10),
        categoryId: categoryId ?? undefined,
        financialAccountId: financialAccountId ?? null,
        merchant: merchant ?? undefined,
        notes: input.notes ?? undefined,
        paymentMethod: (detected.paymentMethod as never) ?? undefined,
        tags: input.tags ?? ['auto-detected', detected.source, ...(subtype ? [subtype] : [])],
        subtype: subtype ?? undefined,
        direction: type === 'transfer' ? detected.direction : undefined,
      } as never,
      { transaction: t, source: 'detected', detectedTransactionId: detected.id, skipMerchantMemory: true }
    );

    await detected.update(
      {
        status: DETECTION_STATUS.USER_CONFIRMED,
        createdTransactionId: created?.id ?? null,
        transactionType: type,
        subtype: subtype ?? null,
        categoryId,
        financialAccountId: financialAccountId ?? null,
        normalizedMerchant: merchant ?? null,
        reviewReason: null,
      },
      { transaction: t }
    );

    await writeAuditLog({
      action: AuditAction.DETECTION_CONFIRM,
      resource: AuditResource.DETECTED_TRANSACTION,
      resourceId: detected.id,
      actorUserId: userId,
      afterState: { transactionId: created?.id ?? null, type, categoryChanged, merchantChanged },
      transaction: t,
    });

    return reloadDto(detected.id, t);
  });
  await deleteCache(syncStateKey(userId));
  return result;
}

/** Rejects a review item. The row is kept so the same message can never come back (spec §19). */
export async function rejectPending(userId: string, id: string): Promise<DetectedTransactionDto> {
  const result = await sequelize.transaction(async (t) => {
    const detected = await lockOwned(userId, id, t);
    if (detected.status !== DETECTION_STATUS.PENDING_REVIEW) {
      throw new ValidationError(ERROR_MESSAGES.ALREADY_PROCESSED);
    }
    await detected.update({ status: DETECTION_STATUS.REJECTED, reviewReason: null }, { transaction: t });
    await writeAuditLog({
      action: AuditAction.DETECTION_REJECT,
      resource: AuditResource.DETECTED_TRANSACTION,
      resourceId: detected.id,
      actorUserId: userId,
      transaction: t,
    });
    return reloadDto(detected.id, t);
  });
  await deleteCache(syncStateKey(userId));
  return result;
}

/**
 * Undoes an automatically added or confirmed item: deletes the transaction it created
 * (which reverts the account balance) and marks the detection rejected (gaps R4, R5).
 */
export async function undoDetected(userId: string, id: string): Promise<DetectedTransactionDto> {
  const result = await sequelize.transaction(async (t) => {
    const detected = await lockOwned(userId, id, t);
    if (detected.status !== DETECTION_STATUS.AUTO_APPROVED && detected.status !== DETECTION_STATUS.USER_CONFIRMED) {
      throw new ValidationError(ERROR_MESSAGES.NOT_UNDOABLE);
    }
    const transactionId = detected.createdTransactionId;
    const previousStatus = detected.status;
    if (transactionId) {
      await deleteTransaction(userId, transactionId, { transaction: t });
    }
    await detected.update(
      { status: DETECTION_STATUS.REJECTED, createdTransactionId: null, reviewReason: null },
      { transaction: t }
    );
    await writeAuditLog({
      action: AuditAction.DETECTION_UNDO,
      resource: AuditResource.DETECTED_TRANSACTION,
      resourceId: detected.id,
      actorUserId: userId,
      beforeState: { status: previousStatus, transactionId },
      transaction: t,
    });
    return reloadDto(detected.id, t);
  });
  await deleteCache(syncStateKey(userId));
  return result;
}

// ---------------------------------------------------------------------------------------------
// Merchant rules (plan task T1.9)
// ---------------------------------------------------------------------------------------------

export interface MerchantRuleDto {
  id: string;
  /** Normalized merchant key (lowercase, trimmed): the same key on every client. */
  merchant: string;
  categoryId: string;
  categoryName: string | null;
  updatedAt: string;
}

/**
 * The user's learned rules (plan T5.3), with an ETag over their content so clients can
 * re-sync daily and on login for the cost of a 304.
 */
export async function getMerchantRules(userId: string): Promise<{ rules: MerchantRuleDto[]; etag: string }> {
  const rows = await MerchantCategoryRule.findAll({
    where: { userId },
    order: [['merchant', 'ASC']],
    include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
  });
  const rules = rows.map((row) => {
    const category = (row as MerchantCategoryRule & { category?: { name: string } }).category;
    return {
      id: row.id,
      merchant: row.merchant,
      categoryId: row.categoryId,
      categoryName: category?.name ?? null,
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  });
  const etag = `"${createHash('sha256').update(JSON.stringify(rules)).digest('hex')}"`;
  return { rules, etag };
}

/**
 * Deletes every detected-transaction record of the user (plan T5.7, "Delete my detected data").
 * Transactions they created stay, since they are the user's records now; their link to the
 * detection is cleared by the foreign key. Learned rules stay too, because manual entries
 * teach them as well.
 */
export async function deleteMyDetectedData(userId: string): Promise<{ deleted: number }> {
  const deleted = await DetectedTransaction.destroy({ where: { userId } });
  await deleteCache(syncStateKey(userId));
  await writeAuditLog({
    action: AuditAction.DETECTION_DELETE_ALL,
    resource: AuditResource.DETECTED_TRANSACTION,
    resourceId: userId,
    actorUserId: userId,
    afterState: { deleted },
  });
  return { deleted };
}

/**
 * "Reset learned preferences" (plan T5.7): removes every merchant → category rule of the user,
 * so the app's daily rules sync doesn't bring them back.
 */
export async function deleteMerchantRules(userId: string): Promise<{ deleted: number }> {
  const deleted = await MerchantCategoryRule.destroy({ where: { userId } });
  return { deleted };
}

/** Rules manager (plan T6.4): point one learned rule at another category. */
export async function updateMerchantRule(userId: string, id: string, categoryId: string): Promise<MerchantRuleDto> {
  const [rule, category] = await Promise.all([
    MerchantCategoryRule.findOne({ where: { id, userId } }),
    Category.findOne({ where: { id: categoryId, userId }, attributes: ['id', 'name'] }),
  ]);
  if (!rule) throw new NotFoundError('Rule not found');
  if (!category) throw new NotFoundError(ERROR_MESSAGES.CATEGORY_NOT_FOUND);
  await rule.update({ categoryId });
  return {
    id: rule.id,
    merchant: rule.merchant,
    categoryId,
    categoryName: category.name,
    updatedAt: new Date(rule.updatedAt).toISOString(),
  };
}

/** Rules manager (plan T6.4): forget one learned rule. */
export async function deleteMerchantRule(userId: string, id: string): Promise<{ deleted: number }> {
  const deleted = await MerchantCategoryRule.destroy({ where: { id, userId } });
  if (deleted === 0) throw new NotFoundError('Rule not found');
  return { deleted };
}

export async function saveMerchantRule(userId: string, input: MerchantRuleInput): Promise<MerchantCategoryRule> {
  const category = await Category.findOne({ where: { id: input.categoryId, userId }, attributes: ['id'] });
  if (!category) throw new NotFoundError(ERROR_MESSAGES.CATEGORY_NOT_FOUND);

  // Same normalized key as manual entries (merchantMemory.service), so rules from either path match.
  await upsertMerchantCategoryRule(userId, input.merchant, input.categoryId);
  const rule = await MerchantCategoryRule.findOne({
    where: { userId, merchant: normalizeMerchantKey(input.merchant) },
    include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
  });
  if (!rule) throw new NotFoundError('Rule not found');
  return rule;
}
