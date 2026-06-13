import { AuditLog } from '../models';
import { AuthRequest } from '../middleware/auth';

export async function logAudit(
  req: AuthRequest,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await AuditLog.create({
      userId: req.userId ?? null,
      action,
      resource,
      resourceId: resourceId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
