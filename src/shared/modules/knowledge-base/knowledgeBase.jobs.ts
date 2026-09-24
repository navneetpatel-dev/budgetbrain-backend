import { knowledgeBaseQueue } from '@queue/queues';
import { createLogger } from '@shared/logging';
import { publishedCountries } from './knowledgeBase.repository';

const log = createLogger('system');

/** Queues the nightly build of every country's pack; one job per day even if the cron fires twice. */
export async function enqueueNightlyPackBuild(now: Date = new Date()): Promise<void> {
  try {
    await knowledgeBaseQueue.add('build', { type: 'build' }, { jobId: `kb-build-${now.toISOString().slice(0, 10)}` });
  } catch (error) {
    log.warn('Could not queue the nightly knowledge-pack build', { message: error instanceof Error ? error.message : String(error) });
  }
}

/** The country each registry covers; `null` covers every country the catalog serves. */
const REGISTRY_COUNTRY: Record<string, string | null> = { ifsc: 'IN', fdic: 'US', 'nsi-wikidata': null };

/**
 * Queues the weekly refresh of the downloadable registries (plan T4.2), only for countries the
 * catalog serves. New rows land in `review`, so nothing reaches a pack until an admin publishes it.
 */
export async function enqueueRegistryImports(now: Date = new Date()): Promise<void> {
  try {
    const countries = await publishedCountries();
    const week = `${now.getUTCFullYear()}-${Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / (7 * 86_400_000))}`;
    for (const [importer, country] of Object.entries(REGISTRY_COUNTRY)) {
      if (country && !countries.includes(country)) continue;
      await knowledgeBaseQueue.add(
        'import',
        { type: 'import', importer, ...(country ? {} : { countries }) },
        { jobId: `kb-import-${importer}-${week}` }
      );
    }
  } catch (error) {
    log.warn('Could not queue the registry imports', { message: error instanceof Error ? error.message : String(error) });
  }
}
