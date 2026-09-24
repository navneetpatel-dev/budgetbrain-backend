import { merchantKey } from '@budgetbrain/detection-core';
import { env } from '@config/env';
import { sequelize } from '@database/models';

/**
 * Optional commercial merchant enrichment (plan T4.7, decision D-7): Plaid Enrich, Ntropy and
 * the like behind one interface. Off by default and server-side only. A provider receives the
 * normalized merchant string and country, never an amount, account or message. Results go into
 * the alias table as `source = 'enrichment'` with status `review`, so a person approves them
 * before any pack contains them.
 */
export interface EnrichmentResult {
  canonicalName: string;
  merchantId: string;
  domain?: string;
  mcc?: string;
}

export interface MerchantEnrichmentProvider {
  readonly name: string;
  enrich(normalizedMerchant: string, country: string): Promise<EnrichmentResult | null>;
}

const disabled: MerchantEnrichmentProvider = {
  name: 'none',
  async enrich() {
    return null;
  },
};

/** Registered providers by name. Adding one is the only change needed to turn it on (plus the env value). */
const PROVIDERS: Record<string, MerchantEnrichmentProvider> = { none: disabled };

export function registerEnrichmentProvider(provider: MerchantEnrichmentProvider): void {
  PROVIDERS[provider.name] = provider;
}

export function enrichmentProvider(): MerchantEnrichmentProvider {
  return PROVIDERS[env.MERCHANT_ENRICHMENT_PROVIDER] ?? disabled;
}

/**
 * Looks a merchant up with the configured provider and queues the alias for review.
 * Returns null, and makes no request, while enrichment is off.
 */
export async function enrichMerchant(rawMerchant: string, country: string): Promise<EnrichmentResult | null> {
  const provider = enrichmentProvider();
  if (provider.name === 'none') return null;
  const key = merchantKey(rawMerchant);
  if (!key) return null;
  const result = await provider.enrich(key, country);
  if (!result) return null;
  await sequelize.query(
    `INSERT INTO kb_merchant_aliases (merchant_id, alias_key, country, status, source)
     SELECT :merchantId, :alias, :country, 'review', 'enrichment'
     WHERE EXISTS (SELECT 1 FROM kb_merchants WHERE id = :merchantId)
     ON CONFLICT (alias_key, country) DO NOTHING`,
    { replacements: { merchantId: result.merchantId, alias: key, country } }
  );
  return result;
}
