import { FinancialAccount, Investment, User } from '@database/models';
import { convertAmount, roundMoney } from '@shared/currency/currency.engine';

export async function getNetWorthDashboard(userId: string) {
  const [user, accounts, investments] = await Promise.all([
    User.findByPk(userId, { attributes: ['currency'] }),
    FinancialAccount.findAll({ where: { userId, isActive: true } }),
    Investment.findAll({ where: { userId } }),
  ]);

  const targetCurrency = user?.currency ?? accounts[0]?.currency ?? investments[0]?.currency ?? 'INR';

  let totalAssets = 0;
  let totalLiabilities = 0;
  let bankBalance = 0;
  let creditCardDebt = 0;
  let investmentValue = 0;

  for (const account of accounts) {
    const rawBalance = Number(account.balance);
    const convertedBalance = await convertAmount(rawBalance, account.currency ?? 'INR', targetCurrency);

    if (account.type === 'credit_card') {
      const debt = convertedBalance > 0 ? convertedBalance : 0;
      creditCardDebt += debt;
      totalLiabilities += debt;
    } else {
      bankBalance += convertedBalance;
      totalAssets += convertedBalance;
    }
  }

  for (const inv of investments) {
    const rawValue = Number(inv.quantity) * Number(inv.currentPrice);
    const convertedValue = await convertAmount(rawValue, inv.currency ?? 'INR', targetCurrency);
    investmentValue += convertedValue;
    totalAssets += convertedValue;
  }

  const netWorth = roundMoney(totalAssets - totalLiabilities);

  return {
    summary: {
      netWorth,
      totalAssets: roundMoney(totalAssets),
      totalLiabilities: roundMoney(totalLiabilities),
      bankBalance: roundMoney(bankBalance),
      creditCardDebt: roundMoney(creditCardDebt),
      investmentValue: roundMoney(investmentValue),
      currency: targetCurrency,
    },
    accounts,
    investments: investments.map((inv) => ({
      ...inv.toJSON(),
      currentValue: roundMoney(Number(inv.quantity) * Number(inv.currentPrice)),
      gainLoss: roundMoney(
        Number(inv.quantity) * Number(inv.currentPrice) -
          Number(inv.quantity) * Number(inv.purchasePrice)
      ),
    })),
  };
}

