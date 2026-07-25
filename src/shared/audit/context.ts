import { AsyncLocalStorage } from 'async_hooks';
import type { AuditSource } from './actions';

export interface RequestAuditContext {
  requestId: string;
  source: AuditSource;
  ipAddress: string | null;
  userAgent: string | null;
  actorUserId: string | null;
  actorType: 'user' | 'admin' | 'system' | 'service';
}

const storage = new AsyncLocalStorage<RequestAuditContext>();

export function runWithAuditContext<T>(ctx: RequestAuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): RequestAuditContext | undefined {
  return storage.getStore();
}

export function setAuditActor(userId: string | null, actorType: RequestAuditContext['actorType'] = 'user'): void {
  const store = storage.getStore();
  if (store) {
    store.actorUserId = userId;
    store.actorType = actorType;
  }
}
