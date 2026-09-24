import type { PackKillSwitch } from '@budgetbrain/detection-core';
import { getOrSetCache } from '@core/cache/cache.service';
import { activeKillSwitches } from './knowledgeBase.repository';

/**
 * Active kill switches for `/detection/config` (plan T4.6). Cached for a minute, so flipping a
 * switch reaches clients within one config refresh without a database query per request.
 */
const CACHE_KEY = 'kb:kill-switches';
const TTL_SECONDS = 60;

export function getActiveKillSwitches(): Promise<PackKillSwitch[]> {
  return getOrSetCache(CACHE_KEY, TTL_SECONDS, activeKillSwitches);
}
