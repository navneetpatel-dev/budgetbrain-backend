import { v4 as uuidv4 } from 'uuid';
import {
  User,
  Transaction,
  Subscription,
  Device,
} from '@database/models';
import type { UserCreationAttributes } from '@database/models/user.model';
import type { DeviceCreationAttributes } from '@database/models/device.model';
import type { TransactionAttributes, SubscriptionAttributes } from '@database/models';

export async function createTestUser(overrides: Partial<UserCreationAttributes> = {}): Promise<User> {
  const uniqueId = uuidv4().slice(0, 8);
  return User.create({
    email: `test-${uniqueId}@budgetbrain.test`,
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqr',
    name: `Test User ${uniqueId}`,
    currency: 'INR',
    role: 'free',
    authProvider: 'email',
    emailVerified: true,
    onboardingCompleted: true,
    ...overrides,
  });
}

export async function createTestTransaction(
  userId: string,
  overrides: Partial<TransactionAttributes> = {}
): Promise<Transaction> {
  return Transaction.create({
    userId,
    type: 'expense',
    amount: 250,
    currency: 'INR',
    merchant: 'Test Merchant',
    date: new Date(),
    isRecurring: false,
    ...overrides,
  } as any);
}

export async function createTestSubscription(
  userId: string,
  overrides: Partial<SubscriptionAttributes> = {}
): Promise<Subscription> {
  return Subscription.create({
    userId,
    revenuecatAppUserId: userId,
    productId: 'pro_monthly',
    entitlementId: 'pro',
    status: 'active',
    plan: 'monthly',
    store: 'app_store',
    isLifetime: false,
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    ...overrides,
  } as any);
}

export async function createTestDevice(
  userId: string,
  overrides: Partial<DeviceCreationAttributes> = {}
): Promise<Device> {
  const uniqueId = uuidv4().slice(0, 8);
  return Device.create({
    userId,
    pushToken: `ExponentPushToken[test-${uniqueId}]`,
    deviceName: 'Test iPhone',
    platform: 'ios',
    ...overrides,
  });
}
