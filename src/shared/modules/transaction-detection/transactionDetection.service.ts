import {
  sequelize,
  DetectedTransaction,
  Transaction,
  MerchantCategoryRule,
  Category,
  FinancialAccount,
} from '@database/models';
import { NotFoundError, ValidationError } from '@shared/errors';
import {
  DETECTION_CONFIDENCE,
  DETECTION_STATUS,
  ERROR_MESSAGES,
} from './transactionDetection.constants';
import type {
  ConfirmDetectedTransactionInput,
  MerchantRuleInput,
  NormalizedDetectedPayload,
  SyncDetectedBatchRequest,
  SyncDetectedBatchResponse,
  SyncDetectedItemResult,
  SyncStateResponse,
} from './transactionDetection.types';
import { validateServerDetectedPayload } from './engine/serverValidation.engine';
import { computeServerFingerprint } from './engine/serverDeduplication.engine';

export async function getSyncState(userId: string): Promise<SyncStateResponse> {
  const latestTx = await DetectedTransaction.findOne({
    where: { userId },
    order: [['transactionDate', 'DESC']],
    attributes: ['transactionDate'],
  });

  const totalDetectedCount = await DetectedTransaction.count({
    where: { userId },
  });

  const pendingReviewCount = await DetectedTransaction.count({
    where: { userId, status: DETECTION_STATUS.PENDING_REVIEW },
  });

  return {
    latestSyncedTransactionDate: latestTx ? String(latestTx.transactionDate) : null,
    totalDetectedCount,
    pendingReviewCount,
  };
}

export async function syncBatch(
  userId: string,
  request: SyncDetectedBatchRequest
): Promise<SyncDetectedBatchResponse> {
  const results: SyncDetectedItemResult[] = [];
  let createdCount = 0;
  let alreadySyncedCount = 0;
  let failedCount = 0;

  for (const item of request.items) {
    const valResult = validateServerDetectedPayload(item);
    if (!valResult.isValid) {
      failedCount++;
      results.push({
        fingerprint: item.dedupFingerprint,
        status: 'validation_error',
        error: valResult.error,
      });
      continue;
    }

    const verifiedFingerprint = computeServerFingerprint(userId, item);

    // Check if duplicate exists for this user
    const existing = await DetectedTransaction.findOne({
      where: { userId, dedupFingerprint: verifiedFingerprint },
      attributes: ['id', 'createdTransactionId', 'status'],
    });

    if (existing) {
      alreadySyncedCount++;
      results.push({
        fingerprint: verifiedFingerprint,
        status: 'already_synced',
        detectedId: existing.id,
        transactionId: existing.createdTransactionId,
      });
      continue;
    }

    // Determine initial status based on confidence
    const isHighConfidence = item.confidence >= DETECTION_CONFIDENCE.HIGH_THRESHOLD;
    const initialStatus = isHighConfidence
      ? DETECTION_STATUS.AUTO_APPROVED
      : item.confidence >= DETECTION_CONFIDENCE.MEDIUM_THRESHOLD
      ? DETECTION_STATUS.PENDING_REVIEW
      : DETECTION_STATUS.REJECTED;

    await sequelize.transaction(async (t) => {
      let createdTxId: string | null = null;

      if (isHighConfidence) {
        // Resolve category: item categoryId -> user learned merchant rule -> fallback null
        let resolvedCategoryId = item.categoryId ?? null;
        const merchantName = item.normalizedMerchant || item.merchant;
        if (!resolvedCategoryId && merchantName) {
          const rule = await MerchantCategoryRule.findOne({
            where: {
              userId,
              merchant: merchantName,
            },
            attributes: ['categoryId'],
            transaction: t,
          });
          if (rule) {
            resolvedCategoryId = rule.categoryId;
          }
        }

        const isTransfer = item.transactionType === 'transfer';
        if (!isTransfer) {
          const isIncome = item.transactionType === 'income' || item.transactionType === 'refund';
          const newTx = await Transaction.create(
            {
              userId,
              type: isIncome ? 'income' : 'expense',
              amount: item.amount,
              currency: item.currency || 'INR',
              categoryId: resolvedCategoryId,
              merchant: item.normalizedMerchant || item.merchant || null,
              date: new Date(item.transactionDate),
              financialAccountId: item.financialAccountId ?? null,
              notes: item.transactionType === 'refund' ? 'Auto-detected refund' : 'Auto-detected from bank message',
              isRecurring: false,
              tags: ['auto-detected', item.source, ...(item.transactionType === 'refund' ? ['refund'] : [])],
            },
            { transaction: t }
          );
          createdTxId = newTx.id;
        }
      }

      const detected = await DetectedTransaction.create(
        {
          userId,
          amount: item.amount,
          currency: item.currency || 'INR',
          direction: item.direction,
          transactionType: item.transactionType,
          merchant: item.merchant ?? null,
          normalizedMerchant: item.normalizedMerchant ?? null,
          categoryId: item.categoryId ?? null,
          financialAccountId: item.financialAccountId ?? null,
          accountTail: item.accountTail ?? null,
          referenceNumber: item.referenceNumber ?? null,
          institutionName: item.institutionName ?? null,
          transactionDate: new Date(item.transactionDate),
          confidence: item.confidence,
          dedupFingerprint: verifiedFingerprint,
          source: item.source,
          status: initialStatus,
          createdTransactionId: createdTxId,
          metadata: item.metadata ?? null,
        },
        { transaction: t }
      );

      createdCount++;
      results.push({
        fingerprint: verifiedFingerprint,
        status: 'created',
        detectedId: detected.id,
        transactionId: createdTxId,
      });
    });
  }

  return {
    totalProcessed: request.items.length,
    createdCount,
    alreadySyncedCount,
    failedCount,
    results,
  };
}

export async function listPending(
  userId: string,
  pagination: { limit?: number; offset?: number } = {}
): Promise<{ rows: DetectedTransaction[]; count: number }> {
  const limit = Math.min(pagination.limit ?? 20, 100);
  const offset = pagination.offset ?? 0;

  const { rows, count } = await DetectedTransaction.findAndCountAll({
    where: { userId, status: DETECTION_STATUS.PENDING_REVIEW },
    order: [
      ['transactionDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit,
    offset,
    include: [
      { model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] },
      {
        model: FinancialAccount,
        as: 'financialAccount',
        attributes: ['id', 'name', 'accountType'],
      },
    ],
  });

  return { rows, count };
}

export async function confirmPending(
  userId: string,
  id: string,
  input: ConfirmDetectedTransactionInput
): Promise<DetectedTransaction> {
  return await sequelize.transaction(async (t) => {
    const detected = await DetectedTransaction.findOne({
      where: { id, userId },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!detected) {
      throw new NotFoundError(ERROR_MESSAGES.DETECTION_NOT_FOUND);
    }

    if (detected.status !== DETECTION_STATUS.PENDING_REVIEW) {
      throw new ValidationError(ERROR_MESSAGES.ALREADY_PROCESSED);
    }

    const finalCategoryId = input.categoryId !== undefined ? input.categoryId : detected.categoryId;
    const finalAccountId =
      input.financialAccountId !== undefined
        ? input.financialAccountId
        : detected.financialAccountId;
    const finalMerchant = input.merchant || detected.normalizedMerchant || detected.merchant;

    // User learning: persist preference if opted in
    if (input.learnMerchantCategory && finalCategoryId && finalMerchant) {
      await MerchantCategoryRule.upsert(
        {
          userId,
          merchant: finalMerchant,
          categoryId: finalCategoryId,
        },
        { transaction: t }
      );
    }

    let createdTxId: string | null = null;
    const isTransfer = detected.transactionType === 'transfer';
    if (!isTransfer) {
      const isIncome = detected.transactionType === 'income' || detected.transactionType === 'refund';
      const newTx = await Transaction.create(
        {
          userId,
          type: isIncome ? 'income' : 'expense',
          amount: detected.amount,
          currency: detected.currency,
          categoryId: finalCategoryId,
          financialAccountId: finalAccountId,
          merchant: finalMerchant,
          date: new Date(detected.transactionDate),
          notes: input.notes || (detected.transactionType === 'refund' ? 'Auto-detected refund (Confirmed)' : 'Auto-detected (Confirmed)'),
          isRecurring: false,
          tags: input.tags || ['auto-detected', detected.source, ...(detected.transactionType === 'refund' ? ['refund'] : [])],
        },
        { transaction: t }
      );
      createdTxId = newTx.id;
    }

    detected.status = DETECTION_STATUS.USER_CONFIRMED;
    detected.createdTransactionId = createdTxId;
    if (finalCategoryId) detected.categoryId = finalCategoryId;
    if (finalAccountId) detected.financialAccountId = finalAccountId;
    if (finalMerchant) detected.merchant = finalMerchant;
    await detected.save({ transaction: t });

    return detected;
  });
}

export async function rejectPending(userId: string, id: string): Promise<DetectedTransaction> {
  const detected = await DetectedTransaction.findOne({
    where: { id, userId },
  });

  if (!detected) {
    throw new NotFoundError(ERROR_MESSAGES.DETECTION_NOT_FOUND);
  }

  detected.status = DETECTION_STATUS.REJECTED;
  await detected.save();

  return detected;
}

export async function getMerchantRules(userId: string): Promise<MerchantCategoryRule[]> {
  return await MerchantCategoryRule.findAll({
    where: { userId },
    order: [['merchant', 'ASC']],
    include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'icon', 'color'] }],
  });
}

export async function saveMerchantRule(
  userId: string,
  input: MerchantRuleInput
): Promise<MerchantCategoryRule> {
  const category = await Category.findOne({
    where: { id: input.categoryId, userId },
  });

  if (!category) {
    throw new NotFoundError(ERROR_MESSAGES.CATEGORY_NOT_FOUND);
  }

  const [rule] = await MerchantCategoryRule.upsert({
    userId,
    merchant: input.merchant.trim(),
    categoryId: input.categoryId,
  });

  return rule;
}
