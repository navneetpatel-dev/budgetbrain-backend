import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createTicket, listUserTickets, getTicket } from '../support.service';
import { AppError } from '@shared/errors';

describe('support.service', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('creates and lists support tickets for a user', async () => {
    const user = await createTestUser();
    const ticket = await createTicket(user.id, {
      subject: 'Sync issue',
      message: 'My transactions are not syncing properly',
      priority: 'high',
    });

    expect(ticket.id).toBeDefined();
    expect(ticket.status).toBe('open');
    expect(ticket.priority).toBe('high');

    const list = await listUserTickets(user.id);
    expect(list.tickets).toHaveLength(1);
    expect(list.tickets[0].subject).toBe('Sync issue');
  });

  it('gets a specific ticket by id', async () => {
    const user = await createTestUser();
    const ticket = await createTicket(user.id, {
      subject: 'Billing question',
      message: 'How do I cancel my plan?',
    });

    const fetched = await getTicket(user.id, ticket.id);
    expect(fetched.id).toBe(ticket.id);
    expect(fetched.subject).toBe('Billing question');
  });

  it('throws 404 for missing ticket or another user ticket', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const ticket = await createTicket(user1.id, {
      subject: 'Private ticket',
      message: 'Confidential message',
    });

    await expect(getTicket(user2.id, ticket.id)).rejects.toThrow(AppError);
  });
});
