import type { Transaction } from 'sequelize';
import { AuditLog } from '../models';
import { createLogger } from '../logging';
import { getAuditContext } from './context';
import type {
  AuditActionValue,
  AuditActorType,
  AuditOutcome,
  AuditResourceValue,
  AuditSeverity,
  AuditSource,
} from './actions';

const log = createLogger('system');

export interface AuditEventInput {
  action: AuditActionValue | string;
  resource: AuditResourceValue | string;
  resourceId?: string | null;
  actorUserId?: string | null;
  actorType?: AuditActorType;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  source?: AuditSource;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  /** Optional Sequelize transaction — audit row commits with the business write. */
  transaction?: Transaction;
}

function redactSensitive(value: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const clone = { ...value };
  for (const key of Object.keys(clone)) {
    if (/password|token|secret|authorization|refresh/i.test(key)) {
      clone[key] = '[REDACTED]';
    }
  }
  return clone;
}

/**
 * Append-only audit trail. Fail-open: never breaks the primary request.
 * Prefer calling inside the same DB transaction as the mutating operation when possible.
 */
export async function writeAuditLog(input: AuditEventInput): Promise<void> {
  const ctx = getAuditContext();

  try {
    await AuditLog.create(
      {
        userId: input.actorUserId ?? ctx?.actorUserId ?? null,
        actorType: input.actorType ?? ctx?.actorType ?? 'system',
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        outcome: input.outcome ?? 'success',
        severity: input.severity ?? (input.outcome === 'failure' ? 'warning' : 'info'),
        source: input.source ?? ctx?.source ?? 'system',
        requestId: input.requestId ?? ctx?.requestId ?? null,
        ipAddress: input.ipAddress ?? ctx?.ipAddress ?? null,
        userAgent: input.userAgent ?? ctx?.userAgent ?? null,
        beforeState: redactSensitive(input.beforeState),
        afterState: redactSensitive(input.afterState),
        metadata: redactSensitive(input.metadata),
      },
      input.transaction ? { transaction: input.transaction } : undefined
    );
  } catch (err) {
    log.error('Failed to persist audit log', {
      action: input.action,
      resource: input.resource,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** @deprecated Prefer writeAuditLog — kept for gradual migration of call sites. */
export async function logAuditEvent(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
  context?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  await writeAuditLog({
    actorUserId: userId,
    action,
    resource,
    resourceId,
    metadata,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
  });
}
