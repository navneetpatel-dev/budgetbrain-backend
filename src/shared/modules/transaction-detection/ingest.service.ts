import {
  categoryForTaxonomy,
  formatMinorToDecimal,
  processMessage,
  type CompiledPack,
  type DetectedCandidate,
  type MessageSource,
  type UserContext,
} from '@budgetbrain/detection-core';
import { Category, FinancialAccount } from '@database/models';
import { getActiveKillSwitches } from '@modules/knowledge-base/killSwitches.service';
import { getServerPack } from '@modules/knowledge-base/serverPack.service';
import { getDetected, syncBatch } from './transactionDetection.service';
import type { DetectedItemInput, IngestInput, IngestResponse } from './transactionDetection.types';

/**
 * Pasted SMS and forwarded emails (plan T6.2). The text is parsed here with the same core
 * pipeline and knowledge pack the phone uses, then goes through the normal sync path, so a
 * pasted message and the same message detected on the phone end up as one record.
 *
 * The text only lives in this request: it is never stored, logged or returned. Only the
 * extracted fields reach the database, exactly as when the phone sends them.
 */

const CATEGORY_SOURCE: Record<NonNullable<DetectedCandidate['categorySource']>, DetectedItemInput['categorySource']> = {
  rule: 'rule',
  knowledge_base: 'knowledge_base',
  mcc: 'knowledge_base',
  context: 'context',
  fallback: 'fallback',
};

/** A sender the pack maps to this institution, for text pasted without its sender. */
function senderFor(pack: CompiledPack, institutionId: string, source: MessageSource): string | null {
  if (source === 'email') {
    for (const [domain, id] of pack.emailDomains) if (id === institutionId) return `alerts@${domain}`;
    return null;
  }
  for (const [header, id] of pack.smsHeaders) if (id === institutionId) return header;
  return null;
}

/** Institutions the user can pick when their pasted text has no sender. */
export async function listIngestInstitutions(): Promise<{ id: string; name: string; country: string }[]> {
  const pack = await getServerPack();
  return [...pack.institutions.values()]
    .filter((inst) => [...pack.smsHeaders.values(), ...pack.emailDomains.values()].includes(inst.id))
    .map((inst) => ({ id: inst.id, name: inst.name, country: inst.country }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toItem(candidate: DetectedCandidate, categoryId: string | null): DetectedItemInput {
  return {
    clientId: candidate.fingerprint.slice(3, 27),
    amount: formatMinorToDecimal(candidate.amountMinor, candidate.currency),
    currency: candidate.currency,
    direction: candidate.direction,
    transactionType: candidate.transactionType,
    subtype: candidate.subtype,
    paymentMethod: candidate.paymentMethod === 'wallet' ? 'other' : candidate.paymentMethod,
    institutionId: candidate.institutionId,
    accountTail: candidate.accountTail,
    referenceNumber: candidate.referenceNumber,
    merchantName: candidate.merchantName,
    merchantId: candidate.merchantId,
    taxonomyCode: candidate.taxonomyCode,
    categoryId,
    categorySource: candidate.categorySource ? CATEGORY_SOURCE[candidate.categorySource] : null,
    financialAccountId: null,
    transactionDate: candidate.transactionDate,
    receivedAt: candidate.receivedAt,
    evidence: candidate.evidence,
    confidenceTier: candidate.confidenceTier,
    dedupFingerprint: candidate.fingerprint,
    source: candidate.source,
  };
}

export async function ingestMessage(userId: string, input: IngestInput, now: Date = new Date()): Promise<IngestResponse> {
  const pack = await getServerPack();
  const source: MessageSource = input.kind === 'email' ? 'email' : 'pasted_sms';
  let sender = input.sender?.trim() || null;
  if (input.institutionId) {
    // The user said which bank this is: use a sender the pack knows for it.
    const known = sender && pack.institutions.has(input.institutionId) ? sender : null;
    sender = known ?? senderFor(pack, input.institutionId, source);
  }
  // A pasted SMS without its sender still reaches core, which can tell the bank from the text
  // (T3.2: a unique bank name or an IFSC code; never above medium, so it waits for review).
  if (!sender && source !== 'pasted_sms') return { status: 'ignored', stage: 'INELIGIBLE', reason: 'unknown_sender', detected: null };

  const [accounts, categories, killSwitches] = await Promise.all([
    FinancialAccount.findAll({ where: { userId }, attributes: ['accountNumberLast4'] }),
    Category.findAll({ where: { userId }, attributes: ['id', 'name'] }),
    getActiveKillSwitches(),
  ]);
  const context: UserContext = {
    userId,
    ownAccountTails: accounts
      .map((a) => (a.accountNumberLast4 ?? '').replace(/\D/g, '').slice(-4))
      .filter((tail) => tail.length >= 3),
    killSwitches,
  };
  const body = input.kind === 'email' && input.subject ? `${input.subject}\n${input.text}` : input.text;
  const result = processMessage(
    { sender: sender ?? '', body, receivedAt: input.receivedAt ?? now.toISOString(), source },
    pack,
    context
  );
  if (!result.candidate || result.terminal === 'IGNORED') {
    return { status: 'ignored', stage: result.stage, reason: result.reasonCode, detected: null };
  }

  const candidate = result.candidate;
  const categoryId =
    candidate.categoryId ??
    categoryForTaxonomy(
      candidate.taxonomyCode,
      categories.map((c) => ({ id: c.id, name: c.name })),
      pack
    );
  const sync = await syncBatch(userId, { items: [toItem(candidate, categoryId)] });
  const item = sync.results[0]!;
  if (item.status === 'validation_error') {
    return { status: 'validation_error', stage: 'PARSE_FAILED', reason: item.error ?? 'invalid', detected: null };
  }
  return {
    status: item.status,
    stage: null,
    reason: null,
    detected: item.detectedId ? await getDetected(userId, item.detectedId) : null,
  };
}
