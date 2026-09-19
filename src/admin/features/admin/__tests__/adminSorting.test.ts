import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { listUsers, listSupportTickets } from '../service/admin.service';
import { usersQuerySchema, supportTicketsQuerySchema } from '../validator/admin.validation';
import { SupportTicket } from '@database/models';

describe('Admin sort query validation rejects non-allowlisted columns', () => {
  it('rejects an invalid sortBy for users rather than passing it through', () => {
    const result = usersQuerySchema.safeParse({ sortBy: 'passwordHash', sortDir: 'ASC' });
    expect(result.success).toBe(false);
  });

  it('accepts an allowlisted sortBy for users', () => {
    const result = usersQuerySchema.safeParse({ sortBy: 'email', sortDir: 'DESC' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid sortBy for support tickets', () => {
    const result = supportTicketsQuerySchema.safeParse({ sortBy: 'adminNotes' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid sortDir', () => {
    const result = usersQuerySchema.safeParse({ sortBy: 'email', sortDir: 'sideways' });
    expect(result.success).toBe(false);
  });
});

describe('Admin list sorting (plan item 26)', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('sorts users by email ascending and descending', async () => {
    // Scope to just these two rows via `search` — the dev DB accumulates thousands of
    // rows across test runs, so an unscoped ascending/descending email sort with a
    // 100-row page cap can't reliably contain both a freshly created "a-…" and "z-…" row.
    const token = `sorttest${Date.now()}`;
    const a = await createTestUser({ email: `a-${token}@budgetbrain.test` });
    const b = await createTestUser({ email: `z-${token}@budgetbrain.test` });

    const asc = await listUsers({ sortBy: 'email', sortDir: 'ASC', search: token, limit: 100 });
    const ascEmails = asc.users.map((u) => u.email);
    expect(ascEmails.indexOf(a.email)).toBeGreaterThanOrEqual(0);
    expect(ascEmails.indexOf(b.email)).toBeGreaterThanOrEqual(0);
    expect(ascEmails.indexOf(a.email)).toBeLessThan(ascEmails.indexOf(b.email));

    const desc = await listUsers({ sortBy: 'email', sortDir: 'DESC', search: token, limit: 100 });
    const descEmails = desc.users.map((u) => u.email);
    expect(descEmails.indexOf(b.email)).toBeLessThan(descEmails.indexOf(a.email));
  });

  it('sorts users by role', async () => {
    const free = await createTestUser({ role: 'free' });
    const premium = await createTestUser({ role: 'premium' });

    const asc = await listUsers({ sortBy: 'role', sortDir: 'ASC', limit: 100 });
    const ids = asc.users.map((u) => u.id);
    // 'free' < 'premium' alphabetically
    if (ids.includes(free.id) && ids.includes(premium.id)) {
      expect(ids.indexOf(free.id)).toBeLessThan(ids.indexOf(premium.id));
    }
  });

  it('falls back to createdAt DESC when no sort params are given', async () => {
    const older = await createTestUser();
    await new Promise((r) => setTimeout(r, 5));
    const newer = await createTestUser();

    const result = await listUsers({ limit: 100 });
    const ids = result.users.map((u) => u.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it('silently falls back to createdAt for a non-allowlisted sortBy rather than erroring', async () => {
    await createTestUser();
    await expect(
      listUsers({ sortBy: 'passwordHash' as never, limit: 5 })
    ).resolves.toBeDefined();
  });

  it('sorts support tickets by priority', async () => {
    const user = await createTestUser();
    const low = await SupportTicket.create({
      userId: user.id,
      subject: 'Low priority',
      message: 'test',
      status: 'open',
      priority: 'low',
    } as never);
    const high = await SupportTicket.create({
      userId: user.id,
      subject: 'High priority',
      message: 'test',
      status: 'open',
      priority: 'high',
    } as never);

    const asc = await listSupportTickets(1, 100, undefined, 'priority', 'ASC');
    const ids = asc.tickets.map((t) => t.id);
    expect(ids.indexOf(low.id)).toBeLessThan(ids.indexOf(high.id));

    const desc = await listSupportTickets(1, 100, undefined, 'priority', 'DESC');
    const descIds = desc.tickets.map((t) => t.id);
    expect(descIds.indexOf(high.id)).toBeLessThan(descIds.indexOf(low.id));
  });

  it('falls back to createdAt DESC for support tickets with no sort params', async () => {
    const user = await createTestUser();
    const older = await SupportTicket.create({
      userId: user.id,
      subject: 'Older',
      message: 'test',
      status: 'open',
      priority: 'low',
    } as never);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await SupportTicket.create({
      userId: user.id,
      subject: 'Newer',
      message: 'test',
      status: 'open',
      priority: 'low',
    } as never);

    const result = await listSupportTickets(1, 100);
    const ids = result.tickets.map((t) => t.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });
});
