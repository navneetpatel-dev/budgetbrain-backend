import { connectDatabase } from '@database/config/database';
import { initModels, User } from '@database/models';
import {
  detectDuplicateExpenses,
  detectSpendingSpikes,
  detectSubscriptionIncreases,
  runAnomalyDetection,
  type TransactionForAnomaly,
  type RecurringSeriesForAnomaly,
} from '@shared/ai/anomalyDetection.engine';
import { chatWithCoach, getSpendingInsights, detectAnomalies } from '@shared/modules/ai/service/ai.service';

async function run() {
  console.log('🤖 Starting Step 08: AI Features Completeness Verification...');
  await connectDatabase();
  initModels();

  // 1. Pure Function Unit Tests: Anomaly Detection Engine
  console.log('\n🧠 1. Testing Anomaly Detection Engine (Pure Function Fixtures)…');

  const now = new Date();
  const baseTxs: TransactionForAnomaly[] = [
    { id: 'tx-1', amount: 500, merchant: 'Swiggy', categoryId: 'cat-food', categoryName: 'Food', date: new Date(now.getTime() - 3600000) },
    { id: 'tx-2', amount: 500, merchant: 'Swiggy', categoryId: 'cat-food', categoryName: 'Food', date: now }, // Duplicate!
    { id: 'tx-3', amount: 450, merchant: 'Zomato', categoryId: 'cat-food', categoryName: 'Food', date: new Date(now.getTime() - 86400000) },
    { id: 'tx-4', amount: 520, merchant: 'Dominos', categoryId: 'cat-food', categoryName: 'Food', date: new Date(now.getTime() - 172800000) },
    { id: 'tx-5', amount: 480, merchant: 'McDonalds', categoryId: 'cat-food', categoryName: 'Food', date: new Date(now.getTime() - 259200000) },
    { id: 'tx-6', amount: 9500, merchant: 'Luxury Dining', categoryId: 'cat-food', categoryName: 'Food', date: now }, // Spending Spike!
    { id: 'tx-7', amount: 799, merchant: 'Netflix', categoryId: 'cat-sub', categoryName: 'Subscriptions', date: now }, // Subscription increase!
  ];

  const series: RecurringSeriesForAnomaly[] = [
    { id: 'sub-1', merchant: 'Netflix', amount: 649, cadence: 'monthly' },
  ];

  // A. Duplicate test
  const dupes = detectDuplicateExpenses(baseTxs);
  console.log(`- Detected duplicates: ${dupes.length}`);
  if (dupes.length !== 1 || dupes[0].transactionId !== 'tx-2') {
    throw new Error('Duplicate detection failed');
  }
  console.log(`  ✓ Reason: ${dupes[0].reason}`);

  // B. Spending spike test
  const spikes = detectSpendingSpikes(baseTxs);
  console.log(`- Detected spikes: ${spikes.length}`);
  if (spikes.length !== 1 || spikes[0].transactionId !== 'tx-6') {
    throw new Error('Spike detection failed');
  }
  console.log(`  ✓ Reason: ${spikes[0].reason}`);

  // C. Subscription increase test
  const subIncreases = detectSubscriptionIncreases(baseTxs, series);
  console.log(`- Detected subscription increases: ${subIncreases.length}`);
  if (subIncreases.length !== 1 || subIncreases[0].transactionId !== 'tx-7') {
    throw new Error('Subscription increase detection failed');
  }
  console.log(`  ✓ Reason: ${subIncreases[0].reason}`);

  // D. Combined runner test
  const allAnomalies = runAnomalyDetection(baseTxs, series);
  console.log(`- Total anomalies from combined runner: ${allAnomalies.length}`);
  if (allAnomalies.length !== 3) {
    throw new Error(`Expected 3 anomalies, got ${allAnomalies.length}`);
  }

  // 2. Financial Coach Multi-Turn & Context Test
  console.log('\n💬 2. Testing Financial Coach & Context Integration…');
  const user = await User.findOne({ where: { email: 'navneetp22875@gmail.com' } });
  if (!user) throw new Error('Test user not found');

  const coachResponse = await chatWithCoach(user.id, 'What are my top spending areas this month?');
  console.log(`Coach conversation created: ${coachResponse.conversationId}`);
  console.log(`Coach reply length: ${coachResponse.reply.length} chars`);
  console.log(`Snippet: "${coachResponse.reply.slice(0, 120)}..."`);
  if (!coachResponse.reply || coachResponse.reply.length < 10) {
    throw new Error('Coach reply empty');
  }

  // 3. Spending Insights Test
  console.log('\n📊 3. Testing Spending Insights…');
  const insights = await getSpendingInsights(user.id);
  console.log('Insights generated:', insights.insights);
  console.log('Summary numbers:', insights.summary);
  if (!insights.insights.length) {
    throw new Error('Insights empty');
  }

  // 4. User Anomaly Detection Test
  console.log('\n🚨 4. Testing User Anomaly Detection Endpoint Service…');
  const userAnomalies = await detectAnomalies(user.id);
  console.log(`Live user anomalies detected: ${userAnomalies.anomalies.length}`);

  console.log('\n✅ ALL AI FEATURES COMPLETENESS CHECKS PASSED!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ AI completeness test failed:', err);
  process.exit(1);
});
