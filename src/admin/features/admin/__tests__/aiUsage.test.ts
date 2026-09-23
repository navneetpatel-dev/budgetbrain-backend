import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { AiConversation } from '@database/models';
import { listAiUsage } from '../admin.service';

describe('listAiUsage', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('computes messageCount in SQL, matching the actual number of messages', async () => {
    const user = await createTestUser();
    const messages = [
      { role: 'user' as const, content: 'Hi', timestamp: new Date().toISOString() },
      { role: 'assistant' as const, content: 'Hello!', timestamp: new Date().toISOString() },
      { role: 'user' as const, content: 'Thanks', timestamp: new Date().toISOString() },
    ];
    const conversation = await AiConversation.create({
      userId: user.id,
      title: 'Test conversation',
      messages,
    });

    const result = await listAiUsage(1, 50);
    const found = result.conversations.find((c) => c.id === conversation.id);

    expect(found).toBeDefined();
    expect(found!.messageCount).toBe(3);
    expect(found!.user?.id).toBe(user.id);
  });

  it('reports zero messages for a conversation with an empty messages array', async () => {
    const user = await createTestUser();
    const conversation = await AiConversation.create({
      userId: user.id,
      title: 'Empty conversation',
      messages: [],
    });

    const result = await listAiUsage(1, 50);
    const found = result.conversations.find((c) => c.id === conversation.id);

    expect(found).toBeDefined();
    expect(found!.messageCount).toBe(0);
  });
});
