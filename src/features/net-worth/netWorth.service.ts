import { FinancialAccount, Investment } from '../../models';

export async function getNetWorthDashboard(userId: string) {
  const [accounts, investments] = await Promise.all([
    FinancialAccount.findAll({ where: { userId, isActive: true } }),
    Investment.findAll({ where: { userId } }),
  ]);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let bankBalance = 0;
  let creditCardDebt = 0;
  let investmentValue = 0;
  const currency = accounts[0]?.currency ?? investments[0]?.currency ?? 'INR';

  for (const account of accounts) {
    const balance = Number(account.balance);
    if (account.type === 'credit_card') {
      const debt = balance > 0 ? balance : 0;
      creditCardDebt += debt;
      totalLiabilities += debt;
    } else {
      bankBalance += balance;
      totalAssets += balance;
    }
  }

  for (const inv of investments) {
    const value = Number(inv.quantity) * Number(inv.currentPrice);
    investmentValue += value;
    totalAssets += value;
  }

  const netWorth = totalAssets - totalLiabilities;

  return {
    summary: {
      netWorth,
      totalAssets,
      totalLiabilities,
      bankBalance,
      creditCardDebt,
      investmentValue,
      currency,
    },
    accounts,
    investments: investments.map((inv) => ({
      ...inv.toJSON(),
      currentValue: Number(inv.quantity) * Number(inv.currentPrice),
      gainLoss:
        Number(inv.quantity) * Number(inv.currentPrice) -
        Number(inv.quantity) * Number(inv.purchasePrice),
    })),
  };
}
