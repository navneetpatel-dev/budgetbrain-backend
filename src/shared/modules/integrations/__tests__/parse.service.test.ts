import { describe, it, expect } from 'vitest';
import { parseSmsContent, parseEmailReceipt } from '../service/parse.service';

describe('parse.service', () => {
  it('parses debit expense SMS messages accurately', () => {
    const text = 'Your A/C ending 1234 debited by INR 1,450.50 at Amazon India on 15/09/2026.';
    const result = parseSmsContent(text);

    expect(result.amount).toBe(1450.5);
    expect(result.type).toBe('expense');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('parses credit income SMS messages with type income', () => {
    const text = 'Salary credited with INR 75,000.00 to your A/C 5678 from ACME CORP on 01/09/2026.';
    const result = parseSmsContent(text);

    expect(result.amount).toBe(75000);
    expect(result.type).toBe('income');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('parses refund and cashback messages as income', () => {
    const text = 'Cashback received INR 150.00 from Google Pay.';
    const result = parseSmsContent(text);

    expect(result.amount).toBe(150);
    expect(result.type).toBe('income');
  });

  it('parses email receipts with subject and body', () => {
    const subject = 'Uber receipt: Your trip on 12-Sep-2026';
    const body = 'Thanks for riding with us. Total: Rs. 385.50';

    const result = parseEmailReceipt(subject, body);

    expect(result.amount).toBe(385.5);
    expect(result.merchant).toBe('Uber');
    expect(result.type).toBe('expense');
    expect(result.confidence).toBeGreaterThan(0.6);
  });
});
