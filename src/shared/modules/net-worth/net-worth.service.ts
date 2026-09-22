import { FinancialAccount, Investment, User } from '@database/models';
import { getExchangeRate, roundMoney } from '@shared/currency/currency.engine';

export async function getNetWorthDashboard(userId: string) {
  const [user, accounts, investments] = await Promise.all([
    User.findByPk(userId, { attributes: ['currency'] }),
    FinancialAccount.findAll({
      where: { userId, isActive: true },
      attributes: ['id', 'name', 'type', 'institution', 'balance', 'currency'],
    }),
    Investment.findAll({
      where: { userId },
      attributes: ['id', 'name', 'type', 'quantity', 'currentPrice', 'purchasePrice', 'currency'],
    }),
  ]);

  const targetCurrency = user?.currency ?? accounts[0]?.currency ?? investments[0]?.currency ?? 'INR';

  // One getExchangeRate call per distinct currency present, not one convertAmount call per
  // account/investment row — accounts/investments are unbounded per user and the raw rows
  // are returned as-is below (both web and mobile read fields off them directly), so this
  // can't collapse into a single SQL-side sum the way expenses.service.ts's fixes did.
  const currencies = new Set<string>([
    ...accounts.map((a) => a.currency ?? 'INR'),
    ...investments.map((i) => i.currency ?? 'INR'),
  ]);
  const rateEntries = await Promise.all(
    [...currencies].map(
      async (c) => [c, c === targetCurrency ? 1 : await getExchangeRate(c, targetCurrency)] as const
    )
  );
  const rateMap = new Map(rateEntries);
  const rateFor = (currency: string | null | undefined) => rateMap.get(currency ?? 'INR') ?? 1;

  let totalAssets = 0;
  let totalLiabilities = 0;
  let bankBalance = 0;
  let creditCardDebt = 0;
  let investmentValue = 0;

  for (const account of accounts) {
    const rawBalance = Number(account.balance);
    const convertedBalance = roundMoney(rawBalance * rateFor(account.currency));

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
    const convertedValue = roundMoney(rawValue * rateFor(inv.currency));
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

