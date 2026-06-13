import { AuditLog } from '../../models';
import { AuthRequest } from '../../middleware/auth';

export async function logAuditEvent(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>,
  context?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<void> {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      resourceId: resourceId ?? null,
      ipAddress: context?.ipAddress ?? null,
      userAgent: context?.userAgent ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

export async function logAudit(
  req: AuthRequest,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await logAuditEvent(req.userId ?? null, action, resource, resourceId, metadata, {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });
}
