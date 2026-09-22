import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction } from '@testHelpers';
import { createGroup, joinGroup, createSplit } from '../family.service';

describe('createSplit participant dedup', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('rejects duplicate participant userIds', async () => {
    const owner = await createTestUser();
    const member = await createTestUser();
    const group = await createGroup(owner.id, 'Split Dedup Family');
    await joinGroup(member.id, group.inviteCode);
    const tx = await createTestTransaction(owner.id, { type: 'expense', amount: 100 });

    await expect(
      createSplit(owner.id, group.id, {
        transactionId: tx.id,
        participants: [
          { userId: member.id, shareAmount: 50 },
          { userId: member.id, shareAmount: 50 },
        ],
      })
    ).rejects.toMatchObject({ code: 'DUPLICATE_SPLIT_PARTICIPANT' });
  });
});
