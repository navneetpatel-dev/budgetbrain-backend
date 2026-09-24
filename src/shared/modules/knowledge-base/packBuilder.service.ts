import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import {
  PACK_SCHEMA_VERSION,
  canonicalJson,
  diffPacks,
  fromBase64,
  signKnowledgePack,
  type KnowledgePack,
  type SignedKnowledgePack,
} from '@budgetbrain/detection-core';
import { env } from '@config/env';
import { sequelize } from '@database/models';
import { getCache, setCache } from '@core/cache/cache.service';
import { AppError } from '@shared/errors';
import { createLogger } from '@shared/logging';
import { loadPackContents, publishedCountries } from './knowledgeBase.repository';
import { getPackFile, packFileUrl, putPackFile } from './packStorage';

const log = createLogger('system');

/** Deltas are built from each of this many previous versions (plan T4.3). */
const DELTA_BASES = 5;
/** Lowest core version that reads the packs built here (deltas, runtime kill switches). */
const MIN_CORE_VERSION = '0.5.0';
const MANIFEST_TTL_SECONDS = 24 * 60 * 60;

export interface PackFileInfo {
  storageKey: string;
  etag: string;
  bytes: number;
}

/** What `/knowledge-pack` answers from, cached in Redis so a request touches no table. */
export interface PackManifest extends PackFileInfo {
  country: string;
  version: number;
  deltas: (PackFileInfo & { baseVersion: number })[];
}

export interface PackResponse {
  country: string;
  version: number;
  etag: string;
  url: string;
  bytes: number;
  /** Present when the client's version has a delta to this one. */
  delta: { baseVersion: number; url: string; bytes: number } | null;
}

const manifestKey = (country: string) => `kb:pack:manifest:${country}`;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function signingKey(): { key: Uint8Array; keyId: string } {
  if (!env.PACK_SIGNING_KEY || !env.PACK_KEY_ID) {
    throw new AppError(500, 'PACK_SIGNING_KEY and PACK_KEY_ID must be set to build knowledge packs', 'PACK_KEY_MISSING');
  }
  return { key: fromBase64(env.PACK_SIGNING_KEY), keyId: env.PACK_KEY_ID };
}

async function store(key: string, body: string): Promise<PackFileInfo> {
  const { bytes } = await putPackFile(key, body);
  return { storageKey: key, etag: `"${sha256(body)}"`, bytes };
}

async function recordFile(country: string, version: number, baseVersion: number | null, file: PackFileInfo, contentHash: string, keyId: string) {
  await sequelize.query(
    `INSERT INTO kb_pack_versions (country, version, base_version, content_hash, etag, storage_key, url, bytes, key_id)
     VALUES (:country, :version, :baseVersion, :contentHash, :etag, :storageKey, :storageKey, :bytes, :keyId)
     ON CONFLICT DO NOTHING`,
    { replacements: { country, version, baseVersion, contentHash, keyId, ...file } }
  );
}

/**
 * Builds, signs and stores the pack for one country from published catalog rows (plan T4.3).
 * Nothing is written when the content is unchanged since the last version. Otherwise a new full
 * pack is stored, plus a delta from each of the last five versions, and the manifest cache is
 * refreshed.
 */
export async function buildPack(country: string, now: Date = new Date()): Promise<{ version: number; built: boolean }> {
  const contents = await loadPackContents(country);
  if (contents.institutions.length === 0) {
    throw new AppError(404, `No published institutions for ${country}`, 'PACK_EMPTY');
  }
  const contentHash = sha256(canonicalJson(contents));
  const previous = await sequelize.query<{ version: number; content_hash: string; storage_key: string }>(
    `SELECT version, content_hash, storage_key FROM kb_pack_versions
     WHERE country = :country AND base_version IS NULL ORDER BY version DESC LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { country, limit: DELTA_BASES } }
  );
  if (previous[0]?.content_hash === contentHash) {
    await refreshManifest(country);
    return { version: previous[0].version, built: false };
  }

  const { key, keyId } = signingKey();
  const version = (previous[0]?.version ?? 0) + 1;
  const pack: KnowledgePack = {
    meta: { schemaVersion: PACK_SCHEMA_VERSION, packVersion: version, country, generatedAt: now.toISOString(), minCoreVersion: MIN_CORE_VERSION },
    ...contents,
  };
  const signed = signKnowledgePack(pack, key, keyId);
  const prefix = env.PACK_STORAGE_PREFIX;
  const full = await store(`${prefix}/kb-pack-${country}-v${version}.json`, JSON.stringify(signed));
  await recordFile(country, version, null, full, contentHash, keyId);

  for (const base of previous) {
    try {
      const baseSigned = JSON.parse(await getPackFile(base.storage_key)) as SignedKnowledgePack;
      const delta = diffPacks(baseSigned.payload, signed);
      const file = await store(`${prefix}/kb-pack-${country}-v${base.version}-to-v${version}.json`, JSON.stringify(delta));
      await recordFile(country, version, base.version, file, contentHash, keyId);
    } catch (error) {
      // A missing old file only costs that delta; clients on that version download the full pack.
      log.warn('Knowledge pack delta skipped', { country, baseVersion: base.version, message: error instanceof Error ? error.message : String(error) });
    }
  }
  await refreshManifest(country);
  log.info('Knowledge pack built', { country, version, bytes: full.bytes });
  return { version, built: true };
}

/** Builds every country that has published data (the nightly job). */
export async function buildAllPacks(): Promise<{ country: string; version: number; built: boolean }[]> {
  const results = [];
  for (const country of await publishedCountries()) results.push({ country, ...(await buildPack(country)) });
  return results;
}

async function loadManifest(country: string): Promise<PackManifest | null> {
  const rows = await sequelize.query<{ version: number; base_version: number | null; storage_key: string; etag: string; bytes: number }>(
    `SELECT version, base_version, storage_key, etag, bytes FROM kb_pack_versions
     WHERE country = :country AND version = (SELECT MAX(version) FROM kb_pack_versions WHERE country = :country)`,
    { type: QueryTypes.SELECT, replacements: { country } }
  );
  const full = rows.find((r) => r.base_version === null);
  if (!full) return null;
  return {
    country,
    version: full.version,
    storageKey: full.storage_key,
    etag: full.etag,
    bytes: full.bytes,
    deltas: rows
      .filter((r) => r.base_version !== null)
      .map((r) => ({ baseVersion: r.base_version!, storageKey: r.storage_key, etag: r.etag, bytes: r.bytes })),
  };
}

async function refreshManifest(country: string): Promise<PackManifest | null> {
  const manifest = await loadManifest(country);
  if (manifest) await setCache(manifestKey(country), manifest, MANIFEST_TTL_SECONDS);
  return manifest;
}

/**
 * The newest pack for a country (`GET …/knowledge-pack`). Served from the Redis manifest, so a
 * request normally makes no database query; `since` picks a delta when one exists.
 */
export async function getPackForClient(country: string, since: number | null): Promise<PackResponse | null> {
  const code = country.toUpperCase();
  const manifest = (await getCache<PackManifest>(manifestKey(code))) ?? (await refreshManifest(code));
  if (!manifest) return null;
  const delta = since !== null ? manifest.deltas.find((d) => d.baseVersion === since) : undefined;
  return {
    country: code,
    version: manifest.version,
    etag: manifest.etag,
    url: await packFileUrl(manifest.storageKey),
    bytes: manifest.bytes,
    delta: delta ? { baseVersion: delta.baseVersion, url: await packFileUrl(delta.storageKey), bytes: delta.bytes } : null,
  };
}
