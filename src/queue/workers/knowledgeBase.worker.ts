import { Worker } from 'bullmq';
import { queueConnection } from '../connection';
import { createLogger } from '@shared/logging';
import { runImport } from '@modules/knowledge-base/knowledgeBase.importers';
import { buildAllPacks, buildPack } from '@modules/knowledge-base/packBuilder.service';
import type { KnowledgeBaseJobData } from '../queues';

const log = createLogger('system');

/** Importer runs and pack builds (plan T4.2, T4.3). Concurrency 1: builds read what imports write. */
export function startKnowledgeBaseWorker(): Worker<KnowledgeBaseJobData> {
  const worker = new Worker<KnowledgeBaseJobData>(
    'knowledge-base',
    async (job) => {
      const data = job.data;
      if (data.type === 'import') return runImport(data.importer, data.file ? { file: data.file } : {});
      return data.country ? buildPack(data.country) : buildAllPacks();
    },
    { connection: queueConnection, concurrency: 1 }
  );
  worker.on('failed', (job, err) => log.error('Knowledge-base job failed', { jobId: job?.id, message: err.message }));
  worker.on('error', (err) => log.warn('Knowledge-base worker error', { message: err.message }));
  return worker;
}
