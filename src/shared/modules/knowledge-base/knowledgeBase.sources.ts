import { merchantKey, type PackInstitution, type PackMerchant, type PackMerchantAlias } from '@budgetbrain/detection-core';
import { AppError } from '@shared/errors';

/**
 * Converters from public registries' own download formats to catalog rows (plan T4.2).
 * Pure functions: the importers fetch (or read a local copy), convert, then write through the
 * registry repository calls, which add rows in `review` and never overwrite curated ones.
 */

/** A fetch limited to what the converters need, so tests pass a fake. */
export type FetchText = (url: string) => Promise<string>;

export const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new AppError(502, `Source download failed: ${res.status} ${url}`, 'KB_SOURCE_FETCH_FAILED');
  return res.text();
};

function parseJson(text: string, source: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, `Not the ${source} JSON format`, 'KB_SOURCE_FORMAT');
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `HDFC Bank Limited` → `hdfc_bank`: the id slug and the key two spellings of one name share. */
export function institutionSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/ (limited|ltd|plc|inc|na|n a|national association|corporation|corp)$/, '')
    .trim()
    .replace(/ /g, '_');
}

interface Existing {
  id: string;
  name: string;
  displayName: string | null;
  codes: Record<string, string>;
}

/**
 * Registry rows → catalog rows, attached to an institution the catalog already has when one
 * matches by national code or by name, so e.g. the IFSC prefix lands on the curated `in.hdfc_bank`
 * instead of creating a second HDFC.
 */
export function matchInstitutions(rows: PackInstitution[], existing: Existing[], codeKey: string): PackInstitution[] {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const row of existing) {
    const code = row.codes?.[codeKey];
    if (code) byCode.set(code, row.id);
    for (const name of [row.name, row.displayName]) if (name) byName.set(institutionSlug(name), row.id);
  }
  const out = new Map<string, PackInstitution>();
  for (const row of rows) {
    const code = row.codes?.[codeKey];
    const id = (code && byCode.get(code)) ?? byName.get(institutionSlug(row.name)) ?? row.id;
    // Two registry rows that land on one institution: the first keeps its codes.
    if (!out.has(id)) out.set(id, { ...row, id });
  }
  return [...out.values()];
}

/**
 * razorpay/ifsc `src/banknames.json` (MIT): `{ "HDFC": "HDFC Bank", … }`, the 4-letter IFSC prefix
 * of every bank RBI assigned one. Gives each Indian bank its `ifscPrefix`, which core uses to
 * recognize a bank from the message text when the sender header is unknown (T3.2).
 */
export function convertIfscBankNames(text: string): PackInstitution[] {
  const data = parseJson(text, 'IFSC bank names');
  if (!isRecord(data)) throw new AppError(400, 'Not the IFSC bank names format', 'KB_SOURCE_FORMAT');
  return Object.entries(data)
    .filter((entry): entry is [string, string] => /^[A-Z]{4}$/.test(entry[0]) && typeof entry[1] === 'string' && entry[1].trim() !== '')
    .map(([prefix, name]) => ({
      id: `in.${institutionSlug(name)}`,
      name: name.trim(),
      displayName: name.trim(),
      country: 'IN',
      type: 'bank' as const,
      codes: { ifscPrefix: prefix },
      verified: false,
    }))
    .filter((row) => row.id !== 'in.');
}

/**
 * FDIC BankFind `GET /api/institutions?filters=ACTIVE:1&fields=NAME,CERT,WEBADDR` (US public
 * domain): `{ data: [{ data: { NAME, CERT, WEBADDR } }] }`.
 */
export function convertFdicInstitutions(text: string): PackInstitution[] {
  const body = parseJson(text, 'FDIC');
  if (!isRecord(body) || !Array.isArray(body.data)) throw new AppError(400, 'Not the FDIC format', 'KB_SOURCE_FORMAT');
  return body.data.flatMap((entry) => {
    const row = isRecord(entry) && isRecord(entry.data) ? entry.data : null;
    const name = typeof row?.NAME === 'string' ? row.NAME.trim() : '';
    const cert = row?.CERT != null ? String(row.CERT) : '';
    if (!name || !/^\d+$/.test(cert)) return [];
    const domain = typeof row?.WEBADDR === 'string' ? hostOf(row.WEBADDR) : null;
    return [
      {
        id: `us.${institutionSlug(name)}_${cert}`,
        name,
        displayName: name,
        country: 'US',
        type: 'bank' as const,
        codes: { fdicCert: cert },
        ...(domain ? { domains: [domain] } : {}),
        verified: false,
      },
    ];
  });
}

function hostOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Name Suggestion Index category → taxonomy code. Categories not listed are skipped. */
const NSI_TAXONOMY: Record<string, string> = {
  'brands/amenity/fast_food': 'FOOD_AND_DRINK.RESTAURANT',
  'brands/amenity/restaurant': 'FOOD_AND_DRINK.RESTAURANT',
  'brands/amenity/cafe': 'FOOD_AND_DRINK.COFFEE',
  'brands/amenity/fuel': 'TRANSPORTATION.GAS',
  'brands/amenity/pharmacy': 'HEALTH',
  'brands/amenity/cinema': 'ENTERTAINMENT',
  'brands/shop/supermarket': 'FOOD_AND_DRINK.GROCERIES',
  'brands/shop/convenience': 'FOOD_AND_DRINK.GROCERIES',
  'brands/shop/chemist': 'HEALTH',
  'brands/shop/department_store': 'GENERAL_MERCHANDISE',
  'brands/shop/variety_store': 'GENERAL_MERCHANDISE',
  'brands/shop/clothes': 'GENERAL_MERCHANDISE',
  'brands/shop/shoes': 'GENERAL_MERCHANDISE',
  'brands/shop/electronics': 'GENERAL_MERCHANDISE',
  'brands/shop/mobile_phone': 'RENT_AND_UTILITIES.TELECOM',
  'brands/shop/doityourself': 'GENERAL_MERCHANDISE',
};

/**
 * Name Suggestion Index `dist/nsi.json` (BSD-3-Clause, with CC0 Wikidata ids):
 * `{ nsi: { "brands/amenity/fast_food": { items: [{ displayName, locationSet: { include }, tags }] } } }`.
 * Only brands with a Wikidata id; a brand in one country is scoped to it, a wider one is global.
 * `countries` (ISO alpha-2) keeps brands available there, global ones included.
 */
export function convertNsiBrands(text: string, countries: string[] = []): { merchants: PackMerchant[]; aliases: PackMerchantAlias[] } {
  const body = parseJson(text, 'Name Suggestion Index');
  if (!isRecord(body) || !isRecord(body.nsi)) throw new AppError(400, 'Not the Name Suggestion Index format', 'KB_SOURCE_FORMAT');
  const wanted = new Set(countries.map((c) => c.toLowerCase()));
  const merchants = new Map<string, PackMerchant>();
  const aliases = new Map<string, PackMerchantAlias>();
  for (const [category, value] of Object.entries(body.nsi)) {
    const taxonomyCode = NSI_TAXONOMY[category];
    if (!taxonomyCode || !isRecord(value) || !Array.isArray(value.items)) continue;
    for (const item of value.items) {
      if (!isRecord(item) || !isRecord(item.tags)) continue;
      const wikidataId = item.tags['brand:wikidata'];
      const name = typeof item.tags.brand === 'string' ? item.tags.brand : typeof item.displayName === 'string' ? item.displayName : '';
      if (typeof wikidataId !== 'string' || !/^Q\d+$/.test(wikidataId) || !name.trim()) continue;
      const include = isRecord(item.locationSet) && Array.isArray(item.locationSet.include) ? item.locationSet.include : [];
      const codes = include.filter((c): c is string => typeof c === 'string' && /^[a-z]{2}$/.test(c));
      const country = codes.length === 1 && include.length === 1 ? codes[0]!.toUpperCase() : null;
      if (wanted.size > 0 && country && !wanted.has(country.toLowerCase())) continue;
      const id = `m.wd_${wikidataId.toLowerCase()}`;
      if (!merchants.has(id)) merchants.set(id, { id, name: name.trim(), country, wikidataId, taxonomyCode });
      const names = [name, item.displayName, item.tags.name, item.tags['brand:en']].filter((n): n is string => typeof n === 'string');
      for (const alias of names.map((n) => merchantKey(n)).filter(Boolean)) {
        const key = `${alias}|${country ?? ''}`;
        if (!aliases.has(key)) aliases.set(key, { merchantId: id, alias, ...(country ? { country } : {}) });
      }
    }
  }
  return { merchants: [...merchants.values()], aliases: [...aliases.values()] };
}
