const SMS_PATTERNS = [
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{2})?)/i,
  /debited.*?([\d,]+(?:\.\d{2})?)/i,
  /spent.*?([\d,]+(?:\.\d{2})?)/i,
];

const MERCHANT_PATTERNS = [
  /(?:at|to|from)\s+([A-Z][A-Za-z0-9\s&.-]{2,30})/i,
  /Info:\s*(.+?)(?:\.|$)/i,
];

const DATE_PATTERNS = [
  /(\d{2}[-/]\d{2}[-/]\d{2,4})/,
  /(\d{2}-[A-Za-z]{3}-\d{2,4})/,
];

export interface ParsedData {
  amount: number | null;
  merchant: string | null;
  date: Date | null;
  confidence: number;
}

export function parseSmsContent(content: string): ParsedData {
  let amount: number | null = null;
  let merchant: string | null = null;
  let date: Date | null = null;
  let confidence = 0;

  for (const pattern of SMS_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      confidence += 0.4;
      break;
    }
  }

  for (const pattern of MERCHANT_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      merchant = match[1].trim();
      confidence += 0.3;
      break;
    }
  }

  for (const pattern of DATE_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const parsed = new Date(match[1]);
      if (!isNaN(parsed.getTime())) {
        date = parsed;
        confidence += 0.2;
        break;
      }
    }
  }

  if (amount && merchant) confidence = Math.min(1, confidence + 0.1);

  return { amount, merchant, date, confidence };
}

export function parseEmailReceipt(subject: string, body: string): ParsedData {
  const combined = `${subject}\n${body}`;
  const smsResult = parseSmsContent(combined);

  const totalMatch = combined.match(/(?:total|amount|paid)[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
  if (totalMatch) {
    smsResult.amount = parseFloat(totalMatch[1].replace(/,/g, ''));
    smsResult.confidence = Math.min(1, smsResult.confidence + 0.2);
  }

  const merchantMatch = subject.match(/^(.+?)\s*(?:receipt|invoice|order)/i);
  if (merchantMatch && !smsResult.merchant) {
    smsResult.merchant = merchantMatch[1].trim();
    smsResult.confidence = Math.min(1, smsResult.confidence + 0.15);
  }

  return smsResult;
}
