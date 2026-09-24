import { readFile } from 'fs/promises';
import { QueryTypes } from 'sequelize';
import {
  ISO_4217_CODES,
  merchantKey,
  minorUnits,
  type KnowledgePack,
  type PackInstitution,
  type PackMerchant,
  type PackMerchantAlias,
  type PackSender,
} from '@budgetbrain/detection-core';
import { sequelize } from '@database/models';
import { AppError } from '@shared/errors';
import * as repo from './knowledgeBase.repository';
import {
  convertFdicInstitutions,
  convertIfscBankNames,
  convertNsiBrands,
  defaultFetchText,
  matchInstitutions,
  type FetchText,
} from './knowledgeBase.sources';

/**
 * Knowledge-base importers (plan T4.2). Every importer is idempotent: rows are upserted by their
 * natural key, so a re-run creates no duplicates and bumps `version` only for rows that changed.
 * Each run is recorded in `kb_import_runs` with its source, licence and fetch time.
 */

export interface ImportResult {
  importer: string;
  rowsWritten: number;
}

interface ImportContext {
  source: string;
  transaction: NonNullable<repo.WriteOptions['transaction']>;
}

type Importer = (ctx: ImportContext, options: ImportOptions) => Promise<number>;

export interface ImportOptions {
  /** Local file for the CSV importers. */
  file?: string;
  /** A pack to seed from; defaults to core's India baseline pack. */
  pack?: KnowledgePack;
  /** Registry importers: how to download the source when no `file` is given (tests pass a fake). */
  fetchText?: FetchText;
  /** A registry source's content, downloaded before the import's transaction opens. */
  text?: string;
  /** `nsi-wikidata`: keep brands available in these countries (ISO alpha-2); empty keeps all. */
  countries?: string[];
}

/**
 * Public data sources the catalog is built from (gap-doc §6.3, §6.5, §6.7; decision D-8).
 * `via` names the importer. Sources with a `download` URL are fetched and converted by their own
 * importer (`knowledgeBase.sources.ts`) and add rows in `review`; the others publish no stable
 * machine-readable file (an HTML page, a keyed API, a bulk archive, or no public list at all) and
 * are loaded by exporting them to CSV for the matching CSV importer.
 */
export const KB_SOURCES = [
  { id: 'iso4217', url: 'https://www.six-group.com/en/products-services/financial-information/data-standards.html', licence: 'ISO 4217 (public list)', via: 'iso4217' },
  { id: 'mcc', url: 'https://www.iso.org/standard/79450.html', licence: 'ISO 18245 codes; descriptions from card-network public lists', via: 'csv-mcc' },
  { id: 'rbi-banks', url: 'https://www.rbi.org.in/Scripts/BS_ViewBanks.aspx', licence: 'RBI public list', via: 'csv-institutions' },
  {
    id: 'ifsc',
    url: 'https://github.com/razorpay/ifsc',
    download: 'https://raw.githubusercontent.com/razorpay/ifsc/master/src/banknames.json',
    licence: 'MIT',
    via: 'ifsc',
  },
  { id: 'npci-upi', url: 'https://www.npci.org.in/what-we-do/upi/3rd-party-apps', licence: 'NPCI public list', via: 'csv-institutions' },
  { id: 'india-dlt', url: 'https://www.trai.gov.in/', licence: 'Operator DLT header registries', via: 'csv-institutions' },
  { id: 'gleif', url: 'https://www.gleif.org/en/lei-data/gleif-golden-copy', licence: 'CC0', via: 'csv-institutions' },
  {
    id: 'fdic',
    url: 'https://banks.data.fdic.gov/docs/',
    download: 'https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&fields=NAME%2CCERT%2CWEBADDR&limit=10000&format=json',
    licence: 'US public domain',
    via: 'fdic',
  },
  { id: 'ncua', url: 'https://ncua.gov/analysis/credit-union-corporate-call-report-data', licence: 'US public domain', via: 'csv-institutions' },
  { id: 'fca', url: 'https://register.fca.org.uk/', licence: 'Open Government Licence', via: 'csv-institutions' },
  { id: 'ecb-mfi', url: 'https://www.ecb.europa.eu/stats/financial_corporations/list_of_financial_institutions/', licence: 'ECB reuse policy', via: 'csv-institutions' },
  { id: 'bcb-pix', url: 'https://www.bcb.gov.br/estabilidadefinanceira/participantespix', licence: 'BCB open data', via: 'csv-institutions' },
  {
    id: 'nsi-wikidata',
    url: 'https://github.com/osmlab/name-suggestion-index',
    download: 'https://cdn.jsdelivr.net/npm/name-suggestion-index@6/dist/nsi.min.json',
    licence: 'BSD-3-Clause (NSI), CC0 (Wikidata)',
    via: 'nsi-wikidata',
  },
] as const;

/** The importers that download their own source. */
export const REGISTRY_IMPORTERS = KB_SOURCES.flatMap((s) => ('download' in s ? [s.id] : []));

/** The source's own file: a local copy when given, else its download. */
async function readSource(id: string, options: ImportOptions): Promise<string> {
  if (options.text !== undefined) return options.text;
  if (options.file) return readFile(options.file, 'utf8');
  const source = KB_SOURCES.find((s) => s.id === id);
  if (!source || !('download' in source)) throw new AppError(400, 'This importer needs a file', 'KB_IMPORT_FILE_REQUIRED');
  return (options.fetchText ?? defaultFetchText)(source.download);
}

async function importRegistryInstitutions(
  rows: PackInstitution[],
  codeKey: string,
  { source, transaction }: ImportContext
): Promise<number> {
  const countries = [...new Set(rows.map((r) => r.country))];
  const matched = matchInstitutions(rows, await repo.institutionsIn(countries, transaction), codeKey);
  return repo.addRegistryInstitutions(matched, { source, transaction });
}

/** A small RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). Header row required. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((cells) => Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? '').trim()])));
}

const list = (value: string | undefined) => (value ? value.split('|').map((v) => v.trim()).filter(Boolean) : []);

async function readCsv(options: ImportOptions): Promise<Record<string, string>[]> {
  if (!options.file) throw new AppError(400, 'This importer needs a CSV file', 'KB_IMPORT_FILE_REQUIRED');
  return parseCsv(await readFile(options.file, 'utf8'));
}

const IMPORTERS: Record<string, Importer> = {
  /** Loads a whole knowledge pack: the seed fixture, and how the sample India pack reaches the DB. */
  async 'seed-pack'({ source, transaction }, options) {
    const pack =
      options.pack ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@budgetbrain/detection-core/packs/baseline/IN.json') as KnowledgePack);
    const w = { source, transaction };
    const country = pack.meta.country;
    let n = 0;
    n += await repo.upsertTaxonomy(pack.taxonomy, w);
    n += await repo.upsertInstitutions(pack.institutions, w);
    const countryOf = new Map(pack.institutions.map((i) => [i.id, i.country]));
    n += await repo.upsertSenders(
      pack.senders.map((s) => ({ ...s, country: countryOf.get(s.institutionId) ?? country })),
      w
    );
    n += await repo.upsertLexicons(pack.lexicons, w);
    n += await repo.upsertTemplates(pack.templates, w);
    n += await repo.upsertMerchants(pack.merchants, w);
    n += await repo.upsertMerchantAliases(pack.merchantAliases, w);
    n += await repo.upsertMcc(pack.mcc, w);
    n += await repo.upsertCurrencies(pack.currencies, w);
    n += await repo.upsertPaymentRails(pack.paymentRails, w);
    return n;
  },

  /** Every active ISO 4217 code with its minor units; symbols come from country packs. */
  async iso4217({ source, transaction }) {
    const rows = ISO_4217_CODES.map((code) => ({
      code,
      minorUnits: minorUnits(code),
      symbols: [],
      decimalSeparator: '.' as const,
      groupSeparator: ',' as const,
      grouping: 'standard' as const,
    }));
    return repo.upsertCurrencies(rows, { source, transaction, keepSymbols: true });
  },

  /**
   * Institutions and their senders. Columns: id, name, display_name, country, type, bic, verified,
   * sms_headers (| separated), email_domains (| separated), notification_packages (| separated).
   */
  async 'csv-institutions'({ source, transaction }, options) {
    const rows = await readCsv(options);
    const institutions: PackInstitution[] = rows.map((r) => ({
      id: r.id!,
      name: r.name!,
      displayName: r.display_name || r.name!,
      country: r.country!.toUpperCase(),
      type: (r.type || 'bank') as PackInstitution['type'],
      ...(r.bic ? { bic: r.bic } : {}),
      verified: r.verified === 'true',
    }));
    const senders: (PackSender & { country: string })[] = rows.flatMap((r) => {
      const country = r.country!.toUpperCase();
      return [
        ...list(r.sms_headers).map((key) => ({ institutionId: r.id!, channel: 'sms' as const, match: 'header' as const, key: key.toUpperCase(), country })),
        ...list(r.email_domains).map((key) => ({ institutionId: r.id!, channel: 'email' as const, match: 'domain' as const, key: key.toLowerCase(), country })),
        ...list(r.notification_packages).map((key) => ({
          institutionId: r.id!,
          channel: 'notification' as const,
          match: 'exact' as const,
          key: key.toLowerCase(),
          country,
        })),
      ];
    });
    return (await repo.upsertInstitutions(institutions, { source, transaction })) + (await repo.upsertSenders(senders, { source, transaction }));
  },

  /** Merchants and aliases. Columns: id, name, country (empty = global), taxonomy_code, mcc, domain, wikidata_id, aliases (| separated). */
  async 'csv-merchants'({ source, transaction }, options) {
    const rows = await readCsv(options);
    const merchants: PackMerchant[] = rows.map((r) => ({
      id: r.id!,
      name: r.name!,
      country: r.country ? r.country.toUpperCase() : null,
      taxonomyCode: r.taxonomy_code!,
      ...(r.mcc ? { mcc: r.mcc } : {}),
      ...(r.domain ? { domain: r.domain } : {}),
      ...(r.wikidata_id ? { wikidataId: r.wikidata_id } : {}),
    }));
    const aliases: PackMerchantAlias[] = rows.flatMap((r) =>
      [r.name!, ...list(r.aliases)]
        .map((alias) => merchantKey(alias))
        .filter(Boolean)
        .map((alias) => ({ merchantId: r.id!, alias, ...(r.country ? { country: r.country.toUpperCase() } : {}) }))
    );
    const unique = [...new Map(aliases.map((a) => [`${a.alias}|${a.country ?? ''}`, a])).values()];
    return (await repo.upsertMerchants(merchants, { source, transaction })) + (await repo.upsertMerchantAliases(unique, { source, transaction }));
  },

  /** razorpay/ifsc bank names: every Indian bank's IFSC prefix (feeds core's content signal, T3.2). */
  async ifsc(ctx, options) {
    return importRegistryInstitutions(convertIfscBankNames(await readSource('ifsc', options)), 'ifscPrefix', ctx);
  },

  /** FDIC BankFind: active US banks with their FDIC certificate number and web domain. */
  async fdic(ctx, options) {
    return importRegistryInstitutions(convertFdicInstitutions(await readSource('fdic', options)), 'fdicCert', ctx);
  },

  /** Name Suggestion Index brands with Wikidata ids; a brand the catalog already has (same Wikidata id) is skipped. */
  async 'nsi-wikidata'({ source, transaction }, options) {
    const { merchants, aliases } = convertNsiBrands(await readSource('nsi-wikidata', options), options.countries);
    const known = await repo.merchantWikidataIds(
      merchants.flatMap((m) => (m.wikidataId ? [m.wikidataId] : [])),
      transaction
    );
    const fresh = merchants.filter((m) => !m.wikidataId || !known.has(m.wikidataId));
    const freshIds = new Set(fresh.map((m) => m.id));
    return repo.addRegistryMerchants(fresh, aliases.filter((a) => freshIds.has(a.merchantId)), { source, transaction });
  },

  /** ISO 18245 merchant category codes. Columns: mcc, taxonomy_code, description. */
  async 'csv-mcc'({ source, transaction }, options) {
    const rows = await readCsv(options);
    return repo.upsertMcc(
      rows.map((r) => ({ mcc: r.mcc!.padStart(4, '0'), taxonomyCode: r.taxonomy_code!, ...(r.description ? { description: r.description } : {}) })),
      { source, transaction }
    );
  },
};

export const IMPORTER_NAMES = Object.keys(IMPORTERS);

/** Runs one importer in a transaction and records the run. */
export async function runImport(
  importer: string,
  options: ImportOptions & { sourceUrl?: string; licence?: string } = {}
): Promise<ImportResult> {
  const run = IMPORTERS[importer];
  if (!run) throw new AppError(400, `Unknown importer: ${importer}`, 'KB_IMPORTER_UNKNOWN');
  const known = KB_SOURCES.find((s) => s.id === importer) ?? KB_SOURCES.find((s) => s.via === importer);
  const [record] = await sequelize.query<{ id: string }>(
    `INSERT INTO kb_import_runs (importer, source_url, licence) VALUES (:importer, :url, :licence) RETURNING id`,
    {
      type: QueryTypes.SELECT,
      replacements: { importer, url: options.sourceUrl ?? options.file ?? (known && 'download' in known ? known.download : known?.url) ?? null, licence: options.licence ?? known?.licence ?? null },
    }
  );
  try {
    // A download can take a while; never hold a database transaction open across it.
    const input = (REGISTRY_IMPORTERS as string[]).includes(importer) ? { ...options, text: await readSource(importer, options) } : options;
    const rowsWritten = await sequelize.transaction((transaction) => run({ source: importer, transaction }, input));
    await sequelize.query(
      `UPDATE kb_import_runs SET status = 'succeeded', rows_written = :rows, finished_at = NOW() WHERE id = :id`,
      { replacements: { rows: rowsWritten, id: record!.id } }
    );
    return { importer, rowsWritten };
  } catch (error) {
    await sequelize.query(`UPDATE kb_import_runs SET status = 'failed', error = :error, finished_at = NOW() WHERE id = :id`, {
      replacements: { error: error instanceof Error ? error.message : String(error), id: record!.id },
    });
    throw error;
  }
}
