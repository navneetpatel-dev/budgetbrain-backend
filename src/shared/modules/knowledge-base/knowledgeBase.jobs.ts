import { knowledgeBaseQueue } from '@queue/queues';
import { createLogger } from '@shared/logging';

const log = createLogger('system');

/** Queues the nightly build of every country's pack; one job per day even if the cron fires twice. */
export async function enqueueNightlyPackBuild(now: Date = new Date()): Promise<void> {
  try {
    await knowledgeBaseQueue.add('build', { type: 'build' }, { jobId: `kb-build-${now.toISOString().slice(0, 10)}` });
  } catch (error) {
    log.warn('Could not queue the nightly knowledge-pack build', { message: error instanceof Error ? error.message : String(error) });
  }
}
