import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser } from '@testHelpers';
import { createAccount, listAccounts, updateAccount } from '../accounts.service';
import { AppError } from '@shared/errors';

describe('accounts.service', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('creates and lists accounts for a user', async () => {
    const user = await createTestUser();
    const account = await createAccount(user.id, {
      name: 'Salary Account',
      type: 'bank',
      balance: 25000,
      institution: 'HDFC',
      currency: 'INR',
    });

    expect(account.id).toBeDefined();
    expect(account.name).toBe('Salary Account');
    expect(Number(account.balance)).toBe(25000);

    const list = await listAccounts(user.id);
    expect(list.accounts).toHaveLength(1);
    expect(list.accounts[0].name).toBe('Salary Account');
  });

  it('updates an existing account', async () => {
    const user = await createTestUser();
    const account = await createAccount(user.id, {
      name: 'Old Name',
      type: 'bank',
      balance: 1000,
    });

    const updated = await updateAccount(user.id, account.id, {
      name: 'New Name',
      balance: 5000,
    });

    expect(updated.name).toBe('New Name');
    expect(Number(updated.balance)).toBe(5000);
  });

  it('throws 404 when updating non-existent or other user account', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const account = await createAccount(user1.id, {
      name: 'Private',
      type: 'bank',
      balance: 100,
    });

    await expect(updateAccount(user2.id, account.id, { name: 'Hacked' })).rejects.toThrow(AppError);
  });
});
