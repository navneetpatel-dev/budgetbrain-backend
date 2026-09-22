import { describe, it, expect, beforeAll } from 'vitest';
import { FinancialAccount, Investment } from '@database/models';
import { setupTestDb, createTestUser } from '@testHelpers';
import { convertAmount } from '@shared/currency/currency.engine';
import { getNetWorthDashboard } from '../net-worth.service';

describe('getNetWorthDashboard', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  it('returns zeroed totals for a user with no accounts or investments', async () => {
    const user = await createTestUser({ currency: 'INR' });
    const result = await getNetWorthDashboard(user.id);

    expect(result.summary.netWorth).toBe(0);
    expect(result.summary.totalAssets).toBe(0);
    expect(result.summary.totalLiabilities).toBe(0);
    expect(result.accounts).toHaveLength(0);
    expect(result.investments).toHaveLength(0);
  });

  it('sums same-currency bank balances and credit card debt into assets/liabilities correctly', async () => {
    const user = await createTestUser({ currency: 'INR' });
    await FinancialAccount.create({
      userId: user.id,
      name: 'Checking',
      type: 'bank',
      balance: 5000,
      currency: 'INR',
      isActive: true,
    } as never);
    await FinancialAccount.create({
      userId: user.id,
      name: 'Visa',
      type: 'credit_card',
      balance: 1200,
      currency: 'INR',
      isActive: true,
    } as never);

    const result = await getNetWorthDashboard(user.id);

    expect(result.summary.bankBalance).toBe(5000);
    expect(result.summary.creditCardDebt).toBe(1200);
    expect(result.summary.totalAssets).toBe(5000);
    expect(result.summary.totalLiabilities).toBe(1200);
    expect(result.summary.netWorth).toBe(3800);
  });

  it('converts foreign-currency accounts/investments into the user base currency, matching convertAmount exactly', async () => {
    const user = await createTestUser({ currency: 'INR' });
    await FinancialAccount.create({
      userId: user.id,
      name: 'US Checking',
      type: 'bank',
      balance: 100,
      currency: 'USD',
      isActive: true,
    } as never);
    await Investment.create({
      userId: user.id,
      name: 'Apple',
      type: 'stocks',
      quantity: 2,
      purchasePrice: 100,
      currentPrice: 150,
      currency: 'USD',
      purchaseDate: new Date(),
    } as never);

    const result = await getNetWorthDashboard(user.id);

    const usdBalanceInInr = await convertAmount(100, 'USD', 'INR');
    const usdInvestmentValueInInr = await convertAmount(300, 'USD', 'INR'); // 2 * 150

    expect(result.summary.bankBalance).toBe(usdBalanceInInr);
    expect(result.summary.investmentValue).toBe(usdInvestmentValueInInr);
    expect(result.summary.totalAssets).toBe(
      Math.round((usdBalanceInInr + usdInvestmentValueInInr) * 100) / 100
    );
  });

  it('excludes inactive accounts from the dashboard', async () => {
    const user = await createTestUser({ currency: 'INR' });
    await FinancialAccount.create({
      userId: user.id,
      name: 'Closed account',
      type: 'bank',
      balance: 999,
      currency: 'INR',
      isActive: false,
    } as never);

    const result = await getNetWorthDashboard(user.id);

    expect(result.accounts).toHaveLength(0);
    expect(result.summary.bankBalance).toBe(0);
  });

  it("computes each investment's currentValue and gainLoss from quantity/price fields", async () => {
    const user = await createTestUser({ currency: 'INR' });
    await Investment.create({
      userId: user.id,
      name: 'Index Fund',
      type: 'mutual_fund',
      quantity: 10,
      purchasePrice: 50,
      currentPrice: 65,
      currency: 'INR',
      purchaseDate: new Date(),
    } as never);

    const result = await getNetWorthDashboard(user.id);

    expect(result.investments).toHaveLength(1);
    expect(result.investments[0].currentValue).toBe(650);
    expect(result.investments[0].gainLoss).toBe(150);
  });
});
