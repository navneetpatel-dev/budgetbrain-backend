import { connectDatabase } from '@database/config/database';
import {
  initModels,
  sequelize,
  User,
  Category,
  FinancialAccount,
  IncomeSource,
  RecurringSeries,
  Budget,
  BudgetAlert,
  Goal,
  GoalContribution,
  Loan,
  LoanPayment,
  Investment,
  FamilyGroup,
  FamilyMember,
  ExpenseSplitParticipant,
  MerchantCategoryRule,
  ParsedTransaction,
  Notification,
  AiConversation,
  SupportTicket,
  AuditLog,
  Transaction,
  Subscription,
  DEFAULT_CATEGORIES,
} from '@database/models';

import { hashPassword } from '@core/auth/jwt';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@budgetbrain.app';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
const ADMIN_NAME = 'Admin User';

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function daysAhead(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function runSeed() {
  console.log('🚀 Starting BudgetBrain Comprehensive Database Seeder…');
  const connected = await connectDatabase();
  if (!connected) {
    console.error('❌ Cannot seed — database unavailable');
    process.exit(1);
  }

  initModels();
  await sequelize.sync({ alter: false });

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  // 1. Users
  console.log('👤 Seeding users…');
  let admin = await User.findOne({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    await admin.update({
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
      emailVerified: true,
      onboardingCompleted: true,
      currency: 'INR',
      country: 'India',
    });
  } else {
    admin = await User.create({
      email: ADMIN_EMAIL,
      passwordHash,
      name: ADMIN_NAME,
      role: 'admin',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  let priya = await User.findOne({ where: { email: 'priya@budgetbrain.app' } });
  if (!priya) {
    priya = await User.create({
      email: 'priya@budgetbrain.app',
      passwordHash,
      name: 'Priya Sharma',
      role: 'free',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  let rahul = await User.findOne({ where: { email: 'rahul@budgetbrain.app' } });
  if (!rahul) {
    rahul = await User.create({
      email: 'rahul@budgetbrain.app',
      passwordHash,
      name: 'Rahul Sharma',
      role: 'free',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  const navneetPasswordHash = await hashPassword('Test@123');
  let navneet = await User.findOne({ where: { email: 'navneetp22875@gmail.com' } });
  if (navneet) {
    await navneet.update({
      passwordHash: navneetPasswordHash,
      name: 'Navneet',
      role: 'premium',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  } else {
    navneet = await User.create({
      email: 'navneetp22875@gmail.com',
      passwordHash: navneetPasswordHash,
      name: 'Navneet',
      role: 'premium',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  let vikram = await User.findOne({ where: { email: 'vikram@budgetbrain.app' } });
  if (!vikram) {
    vikram = await User.create({
      email: 'vikram@budgetbrain.app',
      passwordHash,
      name: 'Vikram Patel',
      role: 'lifetime',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  let anita = await User.findOne({ where: { email: 'anita@budgetbrain.app' } });
  if (!anita) {
    anita = await User.create({
      email: 'anita@budgetbrain.app',
      passwordHash,
      name: 'Anita Roy',
      role: 'free',
      emailVerified: true,
      onboardingCompleted: true,
      country: 'India',
      currency: 'INR',
    });
  }

  const adminId = admin.id;


  // 2. Categories
  console.log('🏷️  Seeding categories…');
  const existingCats = await Category.findAll({ where: { userId: adminId } });
  let categoryMap: Record<string, Category> = {};

  if (existingCats.length === 0) {
    const createdCats = await Category.bulkCreate(
      DEFAULT_CATEGORIES.map((cat, index) => ({
        userId: adminId,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        isDefault: true,
        sortOrder: index,
      }))
    );
    for (const c of createdCats) {
      categoryMap[c.name.toLowerCase()] = c;
    }
  } else {
    for (const c of existingCats) {
      categoryMap[c.name.toLowerCase()] = c;
    }
  }

  // Ensure 'Subscriptions' and 'Travel' categories exist
  if (!categoryMap['subscriptions']) {
    const subCat = await Category.create({
      userId: adminId,
      name: 'Subscriptions',
      icon: 'repeat',
      color: '#A29BFE',
      isDefault: false,
      sortOrder: 15,
    });
    categoryMap['subscriptions'] = subCat;
  }
  if (!categoryMap['travel']) {
    const travelCat = await Category.create({
      userId: adminId,
      name: 'Travel',
      icon: 'airplane',
      color: '#00CEC9',
      isDefault: false,
      sortOrder: 16,
    });
    categoryMap['travel'] = travelCat;
  }

  const foodCat = categoryMap['food'] || existingCats[0];
  const rentCat = categoryMap['rent'] || existingCats[1];
  const utilCat = categoryMap['utilities'] || existingCats[2];
  const transCat = categoryMap['transportation'] || existingCats[3];
  const shopCat = categoryMap['shopping'] || existingCats[4];
  const entCat = categoryMap['entertainment'] || existingCats[5];
  const healthCat = categoryMap['health'] || existingCats[6];
  const investCat = categoryMap['investments'] || existingCats[7];
  const subCat = categoryMap['subscriptions'] || entCat;
  const travelCat = categoryMap['travel'] || transCat;

  // 3. Financial Accounts
  console.log('🏦 Seeding financial accounts…');
  await FinancialAccount.destroy({ where: { userId: adminId } });
  const [hdfcAcc, iciciAcc, axisCard, cashWallet, zerodhaAcc] = await Promise.all([
    FinancialAccount.create({
      userId: adminId,
      name: 'HDFC Bank - Savings',
      type: 'bank',
      institution: 'HDFC Bank',
      accountNumberLast4: '4892',
      balance: 145250.0,
      currency: 'INR',
      isActive: true,
    }),
    FinancialAccount.create({
      userId: adminId,
      name: 'ICICI Bank - Salary Account',
      type: 'bank',
      institution: 'ICICI Bank',
      accountNumberLast4: '8821',
      balance: 82400.0,
      currency: 'INR',
      isActive: true,
    }),
    FinancialAccount.create({
      userId: adminId,
      name: 'Axis Bank - Flipkart Credit Card',
      type: 'credit_card',
      institution: 'Axis Bank',
      accountNumberLast4: '3104',
      balance: -28450.0,
      creditLimit: 200000.0,
      currency: 'INR',
      isActive: true,
    }),
    FinancialAccount.create({
      userId: adminId,
      name: 'Cash in Wallet',
      type: 'cash',
      institution: 'Cash',
      balance: 4500.0,
      currency: 'INR',
      isActive: true,
    }),
    FinancialAccount.create({
      userId: adminId,
      name: 'Zerodha Demat Trading',
      type: 'wallet',
      institution: 'Zerodha Broking',
      accountNumberLast4: '1099',
      balance: 385000.0,
      currency: 'INR',
      isActive: true,
    }),
  ]);

  // 4. Income Sources
  console.log('💼 Seeding income sources…');
  await IncomeSource.destroy({ where: { userId: adminId } });
  const [salarySource, freelanceSource, dividendSource] = await Promise.all([
    IncomeSource.create({
      userId: adminId,
      name: 'Tech Lead Salary',
      type: 'salary',
      isRecurring: true,
      recurringRule: 'monthly on 1st',
    }),
    IncomeSource.create({
      userId: adminId,
      name: 'UI/UX Consulting Freelance',
      type: 'freelancing',
      isRecurring: false,
    }),
    IncomeSource.create({
      userId: adminId,
      name: 'Stock Dividends & Interest',
      type: 'investments',
      isRecurring: true,
      recurringRule: 'quarterly',
    }),
  ]);

  // 5. Recurring Series (Subscriptions & Bills)
  console.log('🔄 Seeding recurring subscriptions & series…');
  await RecurringSeries.destroy({ where: { userId: adminId } });
  const [netflixSub, spotifySub, primeSub, gymSub, cloudSub, broadbandSub] = await Promise.all([
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Netflix',
      categoryId: subCat.id,
      amount: 649.0,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: daysAhead(12),
      lastChargedDate: daysAgo(18),
      active: true,
      reminderDaysBefore: 2,
      source: 'detected',
    }),
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Spotify Premium',
      categoryId: subCat.id,
      amount: 119.0,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: daysAhead(5),
      lastChargedDate: daysAgo(25),
      active: true,
      reminderDaysBefore: 1,
      source: 'manual',
    }),
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Amazon Prime',
      categoryId: subCat.id,
      amount: 1499.0,
      currency: 'INR',
      cadence: 'yearly',
      nextDueDate: daysAhead(140),
      lastChargedDate: daysAgo(225),
      active: true,
      reminderDaysBefore: 7,
      source: 'manual',
    }),
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Cult.fit Gym Membership',
      categoryId: healthCat.id,
      amount: 2500.0,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: daysAhead(8),
      lastChargedDate: daysAgo(22),
      active: true,
      reminderDaysBefore: 3,
      source: 'manual',
    }),
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Google One 100GB Cloud',
      categoryId: subCat.id,
      amount: 130.0,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: daysAhead(19),
      lastChargedDate: daysAgo(11),
      active: true,
      reminderDaysBefore: 1,
      source: 'detected',
    }),
    RecurringSeries.create({
      userId: adminId,
      merchant: 'Airtel Broadband Fiber',
      categoryId: utilCat.id,
      amount: 999.0,
      currency: 'INR',
      cadence: 'monthly',
      nextDueDate: daysAhead(3),
      lastChargedDate: daysAgo(27),
      active: true,
      reminderDaysBefore: 2,
      source: 'manual',
    }),
  ]);

  // 6. Budgets & Alerts
  console.log('📊 Seeding budgets and alerts…');
  await BudgetAlert.destroy({ where: { userId: adminId } });
  await Budget.destroy({ where: { userId: adminId } });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setMonth(endOfMonth.getMonth() + 1);
  endOfMonth.setDate(0);

  const [foodBudget, shopBudget, utilBudget, entBudget] = await Promise.all([
    Budget.create({
      userId: adminId,
      name: 'Food & Dining Budget',
      type: 'monthly',
      amount: 16000.0,
      currency: 'INR',
      categoryId: foodCat.id,
      startDate: startOfMonth,
      endDate: endOfMonth,
      alertThreshold: 80,
      rollover: true,
    }),
    Budget.create({
      userId: adminId,
      name: 'Shopping & Apparel',
      type: 'monthly',
      amount: 12000.0,
      currency: 'INR',
      categoryId: shopCat.id,
      startDate: startOfMonth,
      endDate: endOfMonth,
      alertThreshold: 75,
      rollover: false,
    }),
    Budget.create({
      userId: adminId,
      name: 'Home Utilities & Wifi',
      type: 'monthly',
      amount: 8000.0,
      currency: 'INR',
      categoryId: utilCat.id,
      startDate: startOfMonth,
      endDate: endOfMonth,
      alertThreshold: 90,
      rollover: false,
    }),
    Budget.create({
      userId: adminId,
      name: 'Entertainment & Outings',
      type: 'monthly',
      amount: 6000.0,
      currency: 'INR',
      categoryId: entCat.id,
      startDate: startOfMonth,
      endDate: endOfMonth,
      alertThreshold: 80,
      rollover: true,
    }),
  ]);

  await BudgetAlert.create({
    budgetId: foodBudget.id,
    userId: adminId,
    threshold: 80,
    periodStart: daysAgo(2).toISOString().slice(0, 10),
    triggeredAt: daysAgo(2),
    acknowledged: false,
  });

  // 7. Goals & Contributions
  console.log('🎯 Seeding savings goals…');
  await GoalContribution.destroy({ where: { userId: adminId } });
  await Goal.destroy({ where: { userId: adminId } });

  const [emergencyGoal, vacationGoal, carGoal] = await Promise.all([
    Goal.create({
      userId: adminId,
      name: 'Emergency Fund (6 Months)',
      type: 'emergency_fund',
      targetAmount: 300000.0,
      currentAmount: 225000.0,
      currency: 'INR',
      targetDate: daysAhead(180),
    }),
    Goal.create({
      userId: adminId,
      name: 'Japan Autumn Vacation',
      type: 'vacation',
      targetAmount: 180000.0,
      currentAmount: 95000.0,
      currency: 'INR',
      targetDate: daysAhead(90),
    }),
    Goal.create({
      userId: adminId,
      name: 'New Car Downpayment',
      type: 'car',
      targetAmount: 400000.0,
      currentAmount: 160000.0,
      currency: 'INR',
      targetDate: daysAhead(270),
    }),
  ]);

  await Promise.all([
    GoalContribution.create({
      goalId: emergencyGoal.id,
      userId: adminId,
      amount: 25000.0,
      notes: 'Monthly SIP savings transfer',
      contributedAt: daysAgo(5),
    }),
    GoalContribution.create({
      goalId: emergencyGoal.id,
      userId: adminId,
      amount: 25000.0,
      notes: 'Bonus allocation',
      contributedAt: daysAgo(35),
    }),
    GoalContribution.create({
      goalId: vacationGoal.id,
      userId: adminId,
      amount: 15000.0,
      notes: 'Freelance UI gig saving',
      contributedAt: daysAgo(10),
    }),
    GoalContribution.create({
      goalId: carGoal.id,
      userId: adminId,
      amount: 20000.0,
      notes: 'Regular auto-deposit',
      contributedAt: daysAgo(14),
    }),
  ]);

  // 8. Loans & Loan Payments
  console.log('💳 Seeding loans & EMI payments…');
  await LoanPayment.destroy({ where: { userId: adminId } });
  await Loan.destroy({ where: { userId: adminId } });

  const [carLoan, laptopLoan] = await Promise.all([
    Loan.create({
      userId: adminId,
      name: 'Hyundai Creta Auto Loan',
      type: 'loan',
      principal: 750000.0,
      interestRate: 8.5,
      emiAmount: 15420.0,
      remainingBalance: 485000.0,
      currency: 'INR',
      startDate: daysAgo(540),
      dueDayOfMonth: 5,
      notes: 'Auto-debit from HDFC bank on 5th',
      closed: false,
    }),
    Loan.create({
      userId: adminId,
      name: 'MacBook Pro 16" No-Cost EMI',
      type: 'emi',
      principal: 120000.0,
      interestRate: 0.0,
      emiAmount: 10000.0,
      remainingBalance: 30000.0,
      currency: 'INR',
      startDate: daysAgo(270),
      dueDayOfMonth: 15,
      notes: 'Axis Bank credit card EMI (3 months left)',
      closed: false,
    }),
  ]);

  await Promise.all([
    LoanPayment.create({
      loanId: carLoan.id,
      userId: adminId,
      amount: 15420.0,
      notes: 'September EMI paid',
      paidAt: daysAgo(12),
    }),
    LoanPayment.create({
      loanId: carLoan.id,
      userId: adminId,
      amount: 15420.0,
      notes: 'August EMI paid',
      paidAt: daysAgo(42),
    }),
    LoanPayment.create({
      loanId: laptopLoan.id,
      userId: adminId,
      amount: 10000.0,
      notes: 'September EMI billed to card',
      paidAt: daysAgo(2),
    }),
  ]);

  // 9. Investments
  console.log('📈 Seeding investments portfolio…');
  await Investment.destroy({ where: { userId: adminId } });
  await Promise.all([
    Investment.create({
      userId: adminId,
      name: 'Nifty 50 Index Fund Direct Growth',
      type: 'mutual_fund',
      symbol: 'NIFTY50',
      quantity: 150.0,
      purchasePrice: 186.66,
      currentPrice: 221.33,
      currency: 'INR',
      purchaseDate: daysAgo(365),
    }),
    Investment.create({
      userId: adminId,
      name: 'Tata Consultancy Services (TCS)',
      type: 'stocks',
      symbol: 'TCS.NS',
      quantity: 25.0,
      purchasePrice: 3450.0,
      currentPrice: 3890.0,
      currency: 'INR',
      purchaseDate: daysAgo(210),
    }),
    Investment.create({
      userId: adminId,
      name: 'Sovereign Gold Bond 2028',
      type: 'gold',
      symbol: 'SGB2028',
      quantity: 10.0,
      purchasePrice: 5600.0,
      currentPrice: 6950.0,
      currency: 'INR',
      purchaseDate: daysAgo(480),
    }),
    Investment.create({
      userId: adminId,
      name: 'HDFC 1-Year Fixed Deposit',
      type: 'fd',
      symbol: 'FD-HDFC',
      quantity: 1.0,
      purchasePrice: 100000.0,
      currentPrice: 107100.0,
      currency: 'INR',
      purchaseDate: daysAgo(300),
    }),
  ]);

  // 10. Family Group & Splits
  console.log('👨‍👩‍👧 Seeding family group & split expenses…');
  const existingGroup = await FamilyGroup.findOne({ where: { ownerId: adminId } });
  if (existingGroup) {
    await ExpenseSplitParticipant.destroy({ where: { groupId: existingGroup.id } });
    await FamilyMember.destroy({ where: { groupId: existingGroup.id } });
    await existingGroup.destroy();
  }

  const familyGroup = await FamilyGroup.create({
    ownerId: adminId,
    name: 'Sharma Family & Home',
    inviteCode: 'SHARMA-99',
  });

  await Promise.all([
    FamilyMember.create({
      groupId: familyGroup.id,
      userId: adminId,
      role: 'owner',
      joinedAt: daysAgo(60),
    }),
    FamilyMember.create({
      groupId: familyGroup.id,
      userId: priya.id,
      role: 'admin',
      joinedAt: daysAgo(55),
    }),
    FamilyMember.create({
      groupId: familyGroup.id,
      userId: rahul.id,
      role: 'contributor',
      joinedAt: daysAgo(45),
    }),
  ]);

  // 11. Transactions (Spanning last 60 days)
  console.log('💸 Seeding realistic 60-day transaction history…');
  await Transaction.destroy({ where: { userId: adminId } });

  const transactionsData = [
    // Income
    {
      userId: adminId,
      type: 'income' as const,
      amount: 150000.0,
      currency: 'INR',
      categoryId: null,
      incomeSourceId: salarySource.id,
      notes: 'Monthly Salary Credit - September',
      merchant: 'Infosys / Tech Corp',
      date: daysAgo(16),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: true,
      tags: ['salary', 'income', 'work'],
    },
    {
      userId: adminId,
      type: 'income' as const,
      amount: 150000.0,
      currency: 'INR',
      categoryId: null,
      incomeSourceId: salarySource.id,
      notes: 'Monthly Salary Credit - August',
      merchant: 'Infosys / Tech Corp',
      date: daysAgo(47),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: true,
      tags: ['salary', 'income', 'work'],
    },
    {
      userId: adminId,
      type: 'income' as const,
      amount: 35000.0,
      currency: 'INR',
      categoryId: null,
      incomeSourceId: freelanceSource.id,
      notes: 'Freelance Design Sprint milestone payment',
      merchant: 'Client Studio',
      date: daysAgo(8),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['freelance', 'side-hustle'],
    },
    {
      userId: adminId,
      type: 'income' as const,
      amount: 4200.0,
      currency: 'INR',
      categoryId: null,
      incomeSourceId: dividendSource.id,
      notes: 'TCS Q2 Dividend payout',
      merchant: 'TCS Ltd',
      date: daysAgo(21),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: false,
      tags: ['dividend', 'investment'],
    },

    // Major Expenses
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 32000.0,
      currency: 'INR',
      categoryId: rentCat.id,
      notes: 'Monthly Apartment Rent (2BHK Indiranagar)',
      merchant: 'Landlord - Vinod Kumar',
      date: daysAgo(15),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: true,
      tags: ['rent', 'housing', 'essential'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 32000.0,
      currency: 'INR',
      categoryId: rentCat.id,
      notes: 'Monthly Apartment Rent - August',
      merchant: 'Landlord - Vinod Kumar',
      date: daysAgo(46),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: true,
      tags: ['rent', 'housing', 'essential'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 15420.0,
      currency: 'INR',
      categoryId: transCat.id,
      notes: 'Car EMI Auto-Debit',
      merchant: 'HDFC Car Loan',
      date: daysAgo(12),
      paymentMethod: 'bank_transfer' as const,
      isRecurring: true,
      tags: ['emi', 'car', 'essential'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 10000.0,
      currency: 'INR',
      categoryId: shopCat.id,
      notes: 'MacBook Pro EMI',
      merchant: 'Axis Bank Card EMI',
      date: daysAgo(2),
      paymentMethod: 'card' as const,
      isRecurring: true,
      tags: ['gadgets', 'emi'],
    },

    // Daily & Weekly Spends (Food, Groceries, Dining)
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 4850.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Weekly Grocery Stockup & Veggies',
      merchant: 'D-Mart Supermarket',
      date: daysAgo(3),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['groceries', 'food', 'home'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 1250.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Dinner at Toit Brewpub with friends',
      merchant: 'Toit Brewpub',
      date: daysAgo(4),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['dining', 'weekend', 'social'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 680.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Gourmet Burger dinner order',
      merchant: 'Swiggy',
      date: daysAgo(1),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['swiggy', 'dining'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 420.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Espresso & Croissant',
      merchant: 'Starbucks Coffee',
      date: daysAgo(2),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['coffee', 'work'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 950.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Quick snack and essentials delivery',
      merchant: 'Blinkit',
      date: daysAgo(6),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['groceries', 'snacks'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 3200.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Monthly bulk pantry order',
      merchant: 'Nature Basket',
      date: daysAgo(14),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['groceries', 'pantry'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 1850.0,
      currency: 'INR',
      categoryId: foodCat.id,
      notes: 'Family Sunday Brunch buffet',
      merchant: 'Barbeque Nation',
      date: daysAgo(18),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['family', 'dining', 'weekend'],
    },

    // Transportation
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 3500.0,
      currency: 'INR',
      categoryId: transCat.id,
      notes: 'Fuel tank refill',
      merchant: 'Shell Petrol Pump',
      date: daysAgo(7),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['fuel', 'car'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 480.0,
      currency: 'INR',
      categoryId: transCat.id,
      notes: 'Cab ride to office tech park',
      merchant: 'Uber',
      date: daysAgo(5),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['commute', 'uber'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 520.0,
      currency: 'INR',
      categoryId: transCat.id,
      notes: 'Cab ride back home',
      merchant: 'Uber',
      date: daysAgo(5),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['commute', 'uber'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 3200.0,
      currency: 'INR',
      categoryId: transCat.id,
      notes: 'Monthly Metro smart card recharge',
      merchant: 'BMRCL Metro',
      date: daysAgo(22),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['metro', 'commute'],
    },

    // Shopping
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 3499.0,
      currency: 'INR',
      categoryId: shopCat.id,
      notes: 'Wireless Ergonomic Mechanical Keyboard',
      merchant: 'Amazon',
      date: daysAgo(9),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['tech', 'workspace', 'shopping'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 2850.0,
      currency: 'INR',
      categoryId: shopCat.id,
      notes: 'Running Shoes & Dri-fit T-shirt',
      merchant: 'Decathlon',
      date: daysAgo(11),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['fitness', 'shopping'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 1890.0,
      currency: 'INR',
      categoryId: shopCat.id,
      notes: 'Cotton casual shirts',
      merchant: 'Myntra',
      date: daysAgo(20),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['clothes', 'shopping'],
    },

    // Utilities
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 2450.0,
      currency: 'INR',
      categoryId: utilCat.id,
      notes: 'Electricity bill payment (BESCOM)',
      merchant: 'BESCOM Power',
      date: daysAgo(10),
      paymentMethod: 'upi' as const,
      isRecurring: true,
      tags: ['electricity', 'utilities'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 999.0,
      currency: 'INR',
      categoryId: utilCat.id,
      notes: 'Broadband Fiber 200Mbps',
      merchant: 'Airtel Broadband',
      date: daysAgo(27),
      paymentMethod: 'upi' as const,
      isRecurring: true,
      recurringSeriesId: broadbandSub.id,
      tags: ['wifi', 'bills'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 1100.0,
      currency: 'INR',
      categoryId: utilCat.id,
      notes: 'LPG Gas cylinder booking',
      merchant: 'Indane Gas',
      date: daysAgo(24),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['gas', 'utilities'],
    },

    // Health & Subscriptions
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 2500.0,
      currency: 'INR',
      categoryId: healthCat.id,
      notes: 'Cult.fit Gym Monthly Pack',
      merchant: 'Cult.fit',
      date: daysAgo(22),
      paymentMethod: 'upi' as const,
      isRecurring: true,
      recurringSeriesId: gymSub.id,
      tags: ['gym', 'fitness'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 850.0,
      currency: 'INR',
      categoryId: healthCat.id,
      notes: 'Multivitamins & Omega-3 supplements',
      merchant: 'Apollo Pharmacy',
      date: daysAgo(13),
      paymentMethod: 'upi' as const,
      isRecurring: false,
      tags: ['medicines', 'health'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 649.0,
      currency: 'INR',
      categoryId: subCat.id,
      notes: 'Netflix 4K Premium Plan',
      merchant: 'Netflix',
      date: daysAgo(18),
      paymentMethod: 'card' as const,
      isRecurring: true,
      recurringSeriesId: netflixSub.id,
      tags: ['entertainment', 'subscription'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 119.0,
      currency: 'INR',
      categoryId: subCat.id,
      notes: 'Spotify Individual Premium',
      merchant: 'Spotify',
      date: daysAgo(25),
      paymentMethod: 'card' as const,
      isRecurring: true,
      recurringSeriesId: spotifySub.id,
      tags: ['music', 'subscription'],
    },

    // Entertainment & Travel
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 1100.0,
      currency: 'INR',
      categoryId: entCat.id,
      notes: 'IMAX Movie Tickets (Dune 2) & Popcorn',
      merchant: 'PVR Inox Cinemas',
      date: daysAgo(12),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['movies', 'weekend'],
    },
    {
      userId: adminId,
      type: 'expense' as const,
      amount: 4500.0,
      currency: 'INR',
      categoryId: travelCat.id,
      notes: 'Weekend trip resort booking in Coorg',
      merchant: 'MakeMyTrip Hotels',
      date: daysAgo(30),
      paymentMethod: 'card' as const,
      isRecurring: false,
      tags: ['travel', 'vacation', 'weekend'],
    },
  ];

  const createdTransactions = await Transaction.bulkCreate(transactionsData);

  // 12. Expense Split with Family
  // Link a grocery transaction to the family group split
  const splitTx = createdTransactions.find((t) => t.notes?.includes('Weekly Grocery Stockup'));
  if (splitTx) {
    const total = 4850.0;
    const share = Math.round((total / 3) * 100) / 100;
    await Promise.all([
      ExpenseSplitParticipant.create({
        transactionId: splitTx.id,
        groupId: familyGroup.id,
        userId: adminId,
        shareAmount: share,
        settled: true,
        settledAt: daysAgo(3),
      }),
      ExpenseSplitParticipant.create({
        transactionId: splitTx.id,
        groupId: familyGroup.id,
        userId: priya.id,
        shareAmount: share,
        settled: true,
        settledAt: daysAgo(2),
      }),
      ExpenseSplitParticipant.create({
        transactionId: splitTx.id,
        groupId: familyGroup.id,
        userId: rahul.id,
        shareAmount: share,
        settled: false,
        settledAt: null,
      }),
    ]);
  }

  // 13. Merchant Category Memory Rules
  console.log('🧠 Seeding auto-categorization memory rules…');
  await MerchantCategoryRule.destroy({ where: { userId: adminId } });
  await Promise.all([
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Swiggy',
      categoryId: foodCat.id,
    }),
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Zomato',
      categoryId: foodCat.id,
    }),
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Uber',
      categoryId: transCat.id,
    }),
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Amazon',
      categoryId: shopCat.id,
    }),
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Apollo Pharmacy',
      categoryId: healthCat.id,
    }),
    MerchantCategoryRule.create({
      userId: adminId,
      merchant: 'Netflix',
      categoryId: subCat.id,
    }),
  ]);

  // 14. Parsed Transactions (Staging Queue)
  console.log('📬 Seeding parsed transactions staging…');
  await ParsedTransaction.destroy({ where: { userId: adminId } });
  await Promise.all([
    ParsedTransaction.create({
      userId: adminId,
      source: 'sms',
      rawContent:
        'Rs 450.00 spent on your HDFC Bank Card ending 4892 at BLUE TOKAI COFFEE on 16-SEP-26. Avl Bal: Rs 1,45,250.00. -HDFC Bank',
      parsedAmount: 450.0,
      parsedMerchant: 'Blue Tokai Coffee',
      parsedDate: daysAgo(1),
      confidence: 0.96,
      status: 'pending',
    }),
    ParsedTransaction.create({
      userId: adminId,
      source: 'sms',
      rawContent:
        'Paid Rs 1,890.00 to MYNTRA via UPI Ref 4261899120 from A/c XX8821 on 15-SEP-26. -ICICI Bank',
      parsedAmount: 1890.0,
      parsedMerchant: 'Myntra',
      parsedDate: daysAgo(2),
      confidence: 0.98,
      status: 'confirmed',
    }),
    ParsedTransaction.create({
      userId: adminId,
      source: 'email',
      rawContent:
        'Your Uber receipt: Rs 340.00 for trip from Koramangala to HSR Layout. Thank you for riding with Uber.',
      parsedAmount: 340.0,
      parsedMerchant: 'Uber India',
      parsedDate: daysAgo(3),
      confidence: 0.92,
      status: 'confirmed',
    }),
    ParsedTransaction.create({
      userId: adminId,
      source: 'sms',
      rawContent:
        'OTP 829104 is your verification code for login at HDFC NetBanking. Valid for 10 mins. Do NOT share.',
      parsedAmount: null,
      parsedMerchant: null,
      parsedDate: null,
      confidence: 0.1,
      status: 'rejected',
    }),
  ]);

  // 15. Notifications
  console.log('🔔 Seeding notification center…');
  await Notification.destroy({ where: { userId: adminId } });
  await Promise.all([
    Notification.create({
      userId: adminId,
      type: 'bill_due',
      title: 'Upcoming Bill Due: Airtel Fiber',
      body: 'Your broadband bill of ₹999.00 is due in 3 days (on 20 Sep).',
      data: { recurringSeriesId: broadbandSub.id, amount: 999.0 },
      read: false,
      sentAt: daysAgo(0),
    }),
    Notification.create({
      userId: adminId,
      type: 'budget_exceeded',
      title: 'Budget Alert: Food & Dining at 80%',
      body: 'You have spent ₹12,850 of your ₹16,000 monthly dining budget.',
      data: { budgetId: foodBudget.id, percentage: 80.3 },
      read: false,
      sentAt: daysAgo(1),
    }),
    Notification.create({
      userId: adminId,
      type: 'weekly_digest',
      title: 'Your Weekly Financial Digest',
      body: 'Great job! You saved ₹8,500 more this week compared to last week.',
      data: { weekEnding: daysAgo(3) },
      read: true,
      sentAt: daysAgo(3),
    }),
    Notification.create({
      userId: adminId,
      type: 'goal_achieved',
      title: 'Milestone reached: Emergency Fund!',
      body: 'You crossed 75% of your Emergency Fund goal. Only ₹75,000 remaining!',
      data: { goalId: emergencyGoal.id, percentage: 75 },
      read: true,
      sentAt: daysAgo(5),
    }),
    Notification.create({
      userId: adminId,
      type: 'subscription_renewal',
      title: 'Subscription Renewed: Netflix 4K',
      body: '₹649.00 was charged to your Axis Bank Card for Netflix.',
      data: { recurringSeriesId: netflixSub.id, amount: 649.0 },
      read: true,
      sentAt: daysAgo(18),
    }),
  ]);

  // 16. AI Financial Coach Conversations
  console.log('🤖 Seeding AI Coach conversations…');
  await AiConversation.destroy({ where: { userId: adminId } });
  await Promise.all([
    AiConversation.create({
      userId: adminId,
      title: 'Monthly Budget & Savings Review',
      messages: [
        {
          role: 'user',
          content:
            'Hi Coach, how am I tracking on my spending this month? Where can I cut back to save for my Japan trip?',
          timestamp: daysAgo(2).toISOString(),
        },
        {
          role: 'assistant',
          content:
            'Hello! Based on your current numbers:\n\n1. **Dining & Food:** You have used 80% (₹12,850) of your monthly budget. Reducing weekend dining deliveries could free up around ₹3,000 to ₹4,000.\n2. **Subscriptions:** You have 6 active recurring services totaling ₹5,800/mo. Reviewing underutilized services can yield immediate savings.\n3. **Japan Goal:** You are already at ₹95,000 (52% of your ₹1,80,000 goal)! Diverting ₹15,000 from this month’s freelance income will keep you well on track for your autumn trip.',
          timestamp: daysAgo(2).toISOString(),
        },
      ],
    }),
    AiConversation.create({
      userId: adminId,
      title: 'Portfolio & Emergency Fund Advice',
      messages: [
        {
          role: 'user',
          content: 'Should I invest more into index funds or finish my emergency fund first?',
          timestamp: daysAgo(10).toISOString(),
        },
        {
          role: 'assistant',
          content:
            'Your emergency fund is currently at ₹2,25,000 out of ₹3,00,000 (75%). Having 4.5 months of living expenses covered is solid. I recommend continuing your monthly SIP in the Nifty 50 Index Fund while directing 30% of surplus savings to complete that remaining ₹75,000 cushion over the next 2 months.',
          timestamp: daysAgo(10).toISOString(),
        },
      ],
    }),
  ]);

  // 17. Admin Support Tickets
  console.log('🎫 Seeding support tickets for admin dashboard…');
  await SupportTicket.destroy({ where: { userId: adminId } });
  await Promise.all([
    SupportTicket.create({
      userId: adminId,
      subject: 'Feature Request: Export transactions to Excel / CSV with custom date range',
      message:
        'Hi support team, I love the analytics graphs! Can we please have an option to export selected month transactions to a styled Excel sheet?',
      status: 'in_progress',
      priority: 'medium',
      adminNotes: 'Assigned to sprint backlog for Q4 feature release.',
    }),
    SupportTicket.create({
      userId: priya.id,
      subject: 'Family Group invite link expired',
      message: 'My invite code showed expired when I tried to re-link my tablet device.',
      status: 'resolved',
      priority: 'low',
      adminNotes: 'Regenerated invite code SHARMA-99 and verified device connection.',
      resolvedAt: daysAgo(1),
    }),
    SupportTicket.create({
      userId: rahul.id,
      subject: 'Push notifications timing question',
      message: 'Can I set my daily reminder notification to 9:00 PM instead of 8:00 AM?',
      status: 'open',
      priority: 'low',
    }),
  ]);

  // 18. Admin Audit Logs
  console.log('🛡️  Seeding admin audit logs…');
  await AuditLog.destroy({ where: { userId: adminId } });
  await Promise.all([
    AuditLog.create({
      userId: adminId,
      actorType: 'admin',
      action: 'USER_LOGIN',
      resource: 'auth',
      resourceId: adminId,
      outcome: 'success',
      severity: 'info',
      source: 'mobile',
      ipAddress: '192.168.1.10',
      userAgent: 'BudgetBrain-iOS/1.0.0 (iPhone15,2)',
      metadata: { device: 'iPhone 15 Pro', platform: 'iOS 17' },
    }),
    AuditLog.create({
      userId: adminId,
      actorType: 'user',
      action: 'TRANSACTION_CREATE',
      resource: 'transactions',
      resourceId: splitTx?.id ?? null,
      outcome: 'success',
      severity: 'info',
      source: 'mobile',
      ipAddress: '192.168.1.10',
      metadata: { amount: 4850.0, category: 'Food' },
    }),
    AuditLog.create({
      userId: adminId,
      actorType: 'system',
      action: 'BUDGET_ALERT_TRIGGERED',
      resource: 'budgets',
      resourceId: foodBudget.id,
      outcome: 'success',
      severity: 'warning',
      source: 'system',
      metadata: { budget: 'Food & Dining', threshold: 80 },
    }),
    AuditLog.create({
      userId: adminId,
      actorType: 'admin',
      action: 'SETTINGS_UPDATE',
      resource: 'settings',
      resourceId: null,
      outcome: 'success',
      severity: 'info',
      source: 'web',
      metadata: { currency: 'INR', language: 'en' },
    }),
  ]);

  // 18. Subscriptions & Entitlements
  console.log('💳 Seeding subscriptions…');
  const subsToSeed = [
    {
      userId: navneet.id,
      productId: 'budgetbrain_pro_yearly',
      entitlementId: 'pro',
      status: 'active' as const,
      plan: 'yearly' as const,
      store: 'razorpay' as const,
      isLifetime: false,
      currentPeriodStart: daysAgo(30),
      currentPeriodEnd: daysAhead(335),
      originalPurchaseDate: daysAgo(30),
    },
    {
      userId: priya.id,
      productId: 'budgetbrain_pro_monthly',
      entitlementId: 'pro',
      status: 'active' as const,
      plan: 'monthly' as const,
      store: 'razorpay' as const,
      isLifetime: false,
      currentPeriodStart: daysAgo(10),
      currentPeriodEnd: daysAhead(20),
      originalPurchaseDate: daysAgo(40),
    },
    {
      userId: rahul.id,
      productId: 'budgetbrain_pro_monthly',
      entitlementId: 'pro',
      status: 'cancelled' as const,
      plan: 'monthly' as const,
      store: 'razorpay' as const,
      isLifetime: false,
      currentPeriodStart: daysAgo(40),
      currentPeriodEnd: daysAgo(10),
      originalPurchaseDate: daysAgo(40),
      unsubscribeDetectedAt: daysAgo(10),
    },
    {
      userId: vikram.id,
      productId: 'budgetbrain_pro_lifetime',
      entitlementId: 'pro',
      status: 'active' as const,
      plan: 'lifetime' as const,
      store: 'razorpay' as const,
      isLifetime: true,
      currentPeriodStart: daysAgo(90),
      currentPeriodEnd: null,
      originalPurchaseDate: daysAgo(90),
    },
    {
      userId: anita.id,
      productId: 'budgetbrain_pro_monthly',
      entitlementId: 'pro',
      status: 'expired' as const,
      plan: 'monthly' as const,
      store: 'promotional' as const,
      isLifetime: false,
      currentPeriodStart: daysAgo(60),
      currentPeriodEnd: daysAgo(30),
      originalPurchaseDate: daysAgo(60),
    },
  ];

  for (const subData of subsToSeed) {
    const existing = await Subscription.findOne({
      where: { userId: subData.userId, entitlementId: subData.entitlementId },
    });
    if (existing) {
      await existing.update(subData);
    } else {
      await Subscription.create(subData);
    }
  }

  // 19. Currency Exchange Rates
  console.log('💱 Seeding exchange rates…');
  const { seedInitialExchangeRates } = await import('../../src/shared/currency/currency.engine');
  await seedInitialExchangeRates();

  console.log('\n======================================================');


  console.log('✅ ALL APPLICATION MODULES SEEDED SUCCESSFULLY!');
  console.log('======================================================');
  console.log(`👤 Admin User:       ${ADMIN_EMAIL} (Password: ${ADMIN_PASSWORD})`);
  console.log(`👥 Family Users:     priya@budgetbrain.app, rahul@budgetbrain.app`);
  console.log(`💳 Bank Accounts:    5 accounts (HDFC, ICICI, Axis CC, Cash, Zerodha)`);
  console.log(`💼 Income Sources:   Salary (₹1.5L), Freelance, Dividends`);
  console.log(`💸 Transactions:     ${createdTransactions.length} rich transactions (60-day history)`);
  console.log(`🔄 Subscriptions:    6 recurring series (Netflix, Spotify, Gym, etc.)`);
  console.log(`📊 Budgets & Alerts: 4 monthly budgets with alert triggers`);
  console.log(`🎯 Savings Goals:    3 goals with historical contributions`);
  console.log(`🚗 Loans & EMIs:     2 loans with payment history`);
  console.log(`📈 Investments:      4 assets (Mutual Fund, Stocks, Gold, FD)`);
  console.log(`👨‍👩‍👧 Family Group:     "Sharma Family & Home" with 3-way split expense`);
  console.log(`🧠 Merchant Rules:   6 auto-categorization memory rules`);
  console.log(`📬 Parsed Receipts:  4 staged SMS/email transactions`);
  console.log(`🔔 Notifications:    5 notifications (bills, alerts, digests)`);
  console.log(`🤖 AI Coach:         2 interactive conversation threads`);
  console.log(`🎫 Support Tickets:  3 tickets for Admin view`);
  console.log(`🛡️  Audit Logs:       4 system security & activity logs`);
  console.log('======================================================\n');

}
