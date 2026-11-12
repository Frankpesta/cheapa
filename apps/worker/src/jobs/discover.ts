import type { Job } from 'bullmq';
import { canCrawl, finishCrawlJob, getStore, startCrawlJob } from '../crawl/stores.js';
import { DiscoverJob, jobId, type FetchJob } from '../queues.js';
import { adapterContext, CrawlOutcome, handleCrawlError, type WorkerDeps } from './deps.js';
import { markStoreStale } from './process.js';

export interface DiscoverResult {
  skipped?: 'missing' | 'not_crawlable';
  crawlJobId?: string;
  refs?: number;
}

/**
 * Runs adapter.discover for one store, enqueues a fetch job per ref, then marks listings
 * unseen for 7 days out of stock. One crawl_jobs
 * row per run; a retry of the same BullMQ job reuses it (id kept in job data).
 */
export async function runDiscover(
  deps: WorkerDeps,
  job: Job<DiscoverJob & { crawlJobId?: string }>,
): Promise<DiscoverResult> {
  const { storeId } = DiscoverJob.parse(job.data);
  const store = await getStore(deps.db, storeId);
  if (!store) return { skipped: 'missing' };
  if (!canCrawl(store)) return { skipped: 'not_crawlable' };

  const adapter = deps.registry.forStore(store);
  if (!adapter) throw new CrawlOutcome(`no adapter for ${store.domain} (${store.platform})`, true);
  if (adapter.needsBrowser) {
    throw new CrawlOutcome(`${adapter.id} needs a browser; the Playwright pool is not built yet`, true);
  }

  let crawlJobId = job.data.crawlJobId;
  if (!crawlJobId) {
    crawlJobId = await startCrawlJob(deps.db, store.id, adapter.id);
    await job.updateData({ ...job.data, crawlJobId });
  }
  const log = deps.log.child({ storeId, jobId: job.id, crawlJobId, queue: 'discover' });

  let refs = 0;
  try {
    for await (const ref of adapter.discover(adapterContext(deps, store, log), store)) {
      const data: FetchJob = { storeId, crawlJobId, adapterId: adapter.id, ref };
      await deps.queues.fetch.add('fetch', data, { jobId: jobId('fetch', storeId, ref.url) });
      refs += 1;
    }
  } catch (err) {
    await handleCrawlError(deps, store, crawlJobId, err, 'discover');
  }
  await finishCrawlJob(deps.db, crawlJobId, 'succeeded');
  // Only a sweep that reached the end may declare listings gone.
  await markStoreStale(deps, store);
  log.info({ refs }, 'discover finished');
  return { crawlJobId, refs };
}
