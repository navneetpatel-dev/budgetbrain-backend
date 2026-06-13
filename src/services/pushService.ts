import { Device } from '../models';
import { env } from '../config/env';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const devices = await Device.findAll({
    where: { userId },
  });

  const tokens = devices
    .map((d) => d.pushToken)
    .filter((t): t is string => !!t && t.startsWith('ExponentPushToken'));

  if (!tokens.length) return 0;

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    data,
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('Expo push failed:', await response.text());
      return 0;
    }

    return tokens.length;
  } catch (err) {
    console.error('Push notification error:', err);
    return 0;
  }
}
