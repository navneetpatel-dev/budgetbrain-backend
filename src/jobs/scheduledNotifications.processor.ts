import cron, { type ScheduledTask } from 'node-cron';
import {
  runBillDueReminders,
  runDailyReminder,
  runExchangeRateSync,
  runMonthlyReportDigests,
  runRecurringDetection,
  runRecurringExpenseCheck,
  runRecurringGoalContributions,
  runSubscriptionRenewalReminders,
  runTokenAndReportCleanup,
  runWeeklyDigest,
} from './scheduledNotifications';

const tasks: ScheduledTask[] = [];

export function start(): void {
  tasks.push(cron.schedule('0 9 * * *', () => void runDailyReminder()));
  tasks.push(cron.schedule('0 10 * * *', () => void runSubscriptionRenewalReminders()));
  tasks.push(cron.schedule('0 8 1 * *', () => void runRecurringExpenseCheck()));
  tasks.push(cron.schedule('0 9 * * 1', () => void runWeeklyDigest()));
  tasks.push(cron.schedule('30 9 * * *', () => void runBillDueReminders()));
  tasks.push(cron.schedule('0 2 * * *', () => void runRecurringDetection()));
  tasks.push(cron.schedule('0 7 * * *', () => void runRecurringGoalContributions()));
  tasks.push(cron.schedule('0 6 1 * *', () => void runMonthlyReportDigests()));
  tasks.push(cron.schedule('0 3 * * *', () => void runExchangeRateSync()));
  tasks.push(cron.schedule('0 4 * * *', () => void runTokenAndReportCleanup()));
  console.log('Scheduled jobs started');
}

export function stop(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
}
