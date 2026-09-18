import { Device } from '@database/models';
import { env } from '@config/env';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded';
  };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket[];
  errors?: Array<{ message: string; code: string }>;
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

    const resJson = (await response.json()) as ExpoPushResponse;
    if (resJson.data && Array.isArray(resJson.data)) {
      const deadTokens: string[] = [];
      resJson.data.forEach((ticket, idx) => {
        if (
          ticket.status === 'error' &&
          (ticket.details?.error === 'DeviceNotRegistered' ||
            ticket.details?.error === 'InvalidCredentials')
        ) {
          deadTokens.push(tokens[idx]);
        }
      });

      if (deadTokens.length > 0) {
        await Device.destroy({
          where: { pushToken: deadTokens },
        });
        console.log(`[push] Pruned ${deadTokens.length} dead Expo push token(s)`);
      }
    }

    return tokens.length;
  } catch (err) {
    console.error('Push notification error:', err);
    return 0;
  }
}
