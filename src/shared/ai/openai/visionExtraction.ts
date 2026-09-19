export interface ReceiptExtraction {
  merchant?: string;
  amount?: number;
  date?: string;
  confidence: number;
}

interface VisionExtractionOptions {
  apiKey: string;
  imageUrl: string;
  model?: string;
}

const EXTRACTION_SYSTEM_PROMPT =
  'You extract structured data from a photo of a receipt. Respond with ONLY a JSON object ' +
  'matching exactly: {"merchant": string | null, "amount": number | null, "date": string | null ' +
  '(ISO 8601 date, e.g. "2026-03-05"), "confidence": number between 0 and 1}. "amount" is the ' +
  'final total paid, as a plain number with no currency symbol. If the image is not a receipt or ' +
  'a field cannot be determined, use null for that field and lower the confidence accordingly. ' +
  'Do not include any text outside the JSON object.';

/**
 * Extracts merchant/amount/date from a receipt photo via OpenAI's vision-capable chat
 * completions endpoint. Never throws — returns null on any failure (missing key, network
 * error, malformed response) so a bad scan never breaks the upload flow that calls this
 * fire-and-forget.
 */
export async function extractReceiptData(
  options: VisionExtractionOptions
): Promise<ReceiptExtraction | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model ?? 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the receipt data from this image.' },
              { type: 'image_url', image_url: { url: options.imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[visionExtraction] OpenAI request failed (${response.status})`);
      return null;
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      merchant?: string | null;
      amount?: number | null;
      date?: string | null;
      confidence?: number | null;
    };

    return {
      merchant: parsed.merchant ?? undefined,
      amount: typeof parsed.amount === 'number' ? parsed.amount : undefined,
      date: parsed.date ?? undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
  } catch (err) {
    console.warn('[visionExtraction] extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
