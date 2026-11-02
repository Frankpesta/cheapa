import { baseEnv, catalogDbEnv, envInt, loadEnv } from '@cheapa/core';
import { z } from 'zod';

const concurrency = (fallback: number) => envInt.pipe(z.number().int().min(1).max(32)).default(fallback);

/**
 * The worker gets the catalog database and the queue Redis only (CLAUDE.md rule 2):
 * no users database, no cache Redis.
 */
export const workerEnvSchema = baseEnv.extend(catalogDbEnv.shape).extend({
  REDIS_QUEUE_URL: z.url({ protocol: /^rediss?$/ }),
  APP_VERSION: z.string().default('dev'),
  // Concurrency on the lean VPS (02-crawler-core.md 2.3).
  WORKER_CONCURRENCY_DISCOVER: concurrency(2),
  WORKER_CONCURRENCY_FETCH: concurrency(6),
  WORKER_CONCURRENCY_PROCESS: concurrency(4),
});

export type WorkerEnv = z.output<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv(workerEnvSchema, source);
}
