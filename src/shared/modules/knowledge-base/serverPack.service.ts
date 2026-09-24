import { compilePack, type CompiledPack, type KnowledgePack } from '@budgetbrain/detection-core';
import { createLogger } from '@shared/logging';
import { builtCountries, loadLatestPack } from './packBuilder.service';

const log = createLogger('system');

/** How long a compiled pack is used before the server checks for a newer version. */
const RECHECK_MS = 5 * 60 * 1000;

let current: { compiled: CompiledPack; versions: string; checkedAt: number } | null = null;
let loading: Promise<CompiledPack> | null = null;

function baseline(): KnowledgePack {
  return require('@budgetbrain/detection-core/packs/baseline/IN.json') as KnowledgePack;
}

async function load(): Promise<CompiledPack> {
  const packs: KnowledgePack[] = [];
  try {
    for (const country of await builtCountries()) {
      const signed = await loadLatestPack(country);
      if (signed) packs.push(signed.payload);
    }
  } catch (error) {
    // A storage or database hiccup falls back to the last compiled pack, or to the baseline.
    log.warn('Server knowledge pack load failed', { message: error instanceof Error ? error.message : String(error) });
    if (current) return current.compiled;
  }
  if (packs.length === 0) packs.push(baseline());
  const versions = packs.map((p) => `${p.meta.country}:${p.meta.packVersion}`).join(',');
  if (current?.versions === versions) {
    current.checkedAt = Date.now();
    return current.compiled;
  }
  const compiled = compilePack(packs);
  current = { compiled, versions, checkedAt: Date.now() };
  log.info('Server knowledge pack compiled', { versions });
  return compiled;
}

/**
 * The knowledge pack the server parses pasted messages and emails with (plan T6.2): the newest
 * built pack of every country, or core's baseline when none has been built. Compiled once and
 * re-checked every few minutes, so a request normally costs nothing.
 */
export async function getServerPack(now: number = Date.now()): Promise<CompiledPack> {
  if (current && now - current.checkedAt < RECHECK_MS) return current.compiled;
  loading ??= load().finally(() => {
    loading = null;
  });
  return loading;
}

export function __resetServerPackForTests(): void {
  current = null;
  loading = null;
}
