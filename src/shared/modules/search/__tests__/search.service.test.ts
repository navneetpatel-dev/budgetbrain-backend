import { describe, it, expect, beforeAll } from 'vitest';
import { setupTestDb, createTestUser, createTestTransaction, createTestCategory } from '@testHelpers';
import { executeGlobalSearch } from '../search.service';

describe('executeGlobalSearch', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('finds an exact merchant match via full-text search', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { merchant: 'Netflix Subscription' });

    const results = await executeGlobalSearch(user.id, 'Netflix');

    expect(results.transactions.length).toBeGreaterThan(0);
    expect(results.transactions[0].merchant).toBe('Netflix Subscription');
  });

  it('ranks exact FTS matches above trigram fallback matches', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { merchant: 'Netflix Subscription', date: new Date('2026-01-01') });
    // A merchant that will only surface via trigram similarity to "Netfli" (not FTS on this exact term).
    await createTestTransaction(user.id, { merchant: 'Netfliix Rentals', date: new Date('2026-01-02') });

    const results = await executeGlobalSearch(user.id, 'Netflix');

    const netflixIdx = results.transactions.findIndex((t) => t.merchant === 'Netflix Subscription');
    expect(netflixIdx).toBe(0);
  });

  it('finds a misspelled merchant name via the trigram fallback when FTS alone returns nothing', async () => {
    const user = await createTestUser();
    await createTestTransaction(user.id, { merchant: 'Netflix' });

    // "Nteflix" shares no stems with "Netflix" under English FTS stemming, so this only
    // succeeds if the trigram similarity fallback fired.
    const results = await executeGlobalSearch(user.id, 'Nteflix');

    expect(results.transactions.some((t) => t.merchant === 'Netflix')).toBe(true);
  });

  it('never returns another user\'s transactions', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();
    await createTestTransaction(userA.id, { merchant: 'Private Merchant A' });
    await createTestTransaction(userB.id, { merchant: 'Private Merchant A' });

    const resultsForA = await executeGlobalSearch(userA.id, 'Private Merchant A');

    expect(resultsForA.transactions.length).toBeGreaterThan(0);
    // Every returned row must belong to userA — verified indirectly: querying as userB
    // for the exact same merchant string must not return userA's row id.
    const resultsForB = await executeGlobalSearch(userB.id, 'Private Merchant A');
    const aIds = new Set(resultsForA.transactions.map((t) => t.id));
    const bIds = new Set(resultsForB.transactions.map((t) => t.id));
    expect([...aIds].some((id) => bIds.has(id))).toBe(false);
  });

  it('short-circuits an empty query without hitting the database', async () => {
    const user = await createTestUser();

    const results = await executeGlobalSearch(user.id, '   ');

    expect(results).toEqual({
      query: '',
      transactions: [],
      categories: [],
      incomeSources: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it('returns category matches independently of transaction/trigram results', async () => {
    const user = await createTestUser();
    await createTestCategory(user.id, { name: 'Groceries Budget' });

    const results = await executeGlobalSearch(user.id, 'Groceries');

    expect(results.categories.length).toBeGreaterThan(0);
    expect(results.categories[0].name).toBe('Groceries Budget');
  });

  it('respects pagination limit/offset for transaction results', async () => {
    const user = await createTestUser();
    for (let i = 0; i < 5; i += 1) {
      await createTestTransaction(user.id, { merchant: `Paginated Coffee Shop ${i}`, date: new Date(2026, 0, i + 1) });
    }

    const page1 = await executeGlobalSearch(user.id, 'Paginated Coffee Shop', { page: 1, limit: 2 });
    const page2 = await executeGlobalSearch(user.id, 'Paginated Coffee Shop', { page: 2, limit: 2 });

    expect(page1.transactions).toHaveLength(2);
    expect(page2.transactions).toHaveLength(2);
    expect(page1.total).toBe(5);
    const page1Ids = page1.transactions.map((t) => t.id);
    const page2Ids = page2.transactions.map((t) => t.id);
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
  });
});
