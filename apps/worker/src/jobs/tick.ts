import { ensurePartitions, listCrawlableStores } from '../crawl/stores.js';
import { jobId } from '../queues.js';
import { isDue, jitterMs, watParts } from '../schedule.js';
import type { WorkerDeps } from './deps.js';

/**
 * Runs every 15 min: enqueues a discover job, jittered, for each store that is due.
 * The job id carries the WAT date, so a store is swept at most once per day however
 * many ticks (or worker processes) see it as due.
 */
export async function runTick(deps: WorkerDeps): Promise<{ enqueued: number }> {
  const now = deps.now?.() ?? new Date();
  const { date } = watParts(now);
  let enqueued = 0;
  for (const store of await listCrawlableStores(deps.db)) {
    if (!isDue(store, now)) continue;
    await deps.queues.discover.add(
      'discover',
      { storeId: store.id },
      { jobId: jobId('discover', store.id, date), delay: jitterMs(deps.random) },
    );
    enqueued += 1;
  }
  deps.log.info({ enqueued }, 'schedule tick');
  return { enqueued };
}

/** Daily: keep price_history partitions three months ahead. */
export async function runPartitions(deps: WorkerDeps): Promise<void> {
  await ensurePartitions(deps.db, 3);
  deps.log.info('price_history partitions ensured');
}
