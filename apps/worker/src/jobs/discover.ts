import type { Job } from 'bullmq';
import { canCrawl, finishCrawlJob, getStore, startCrawlJob } from '../crawl/stores.js';
import { DiscoverJob, jobId, type FetchJob } from '../queues.js';
import { adapterContext, CrawlOutcome, handleCrawlError, type WorkerDeps } from './deps.js';
import { checkRunHealth } from './health.js';
import { markStoreStale } from './process.js';
import { setRefsTotal } from '../crawl/health.js';

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

  // Distinct URLs: a repeated ref is one fetch job, and the run completes when all finish.
  const seen = new Set<string>();
  try {
    for await (const ref of adapter.discover(adapterContext(deps, store, log), store)) {
      if (seen.has(ref.url)) continue;
      seen.add(ref.url);
      const data: FetchJob = { storeId, crawlJobId, adapterId: adapter.id, ref };
      // Scoped to the run: tomorrow's sweep must not be deduplicated against today's jobs.
      await deps.queues.fetch.add('fetch', data, { jobId: jobId('fetch', crawlJobId, ref.url) });
    }
  } catch (err) {
    await handleCrawlError(deps, store, crawlJobId, err, 'discover');
  }
  const refs = seen.size;
  await finishCrawlJob(deps.db, crawlJobId, 'succeeded');
  await setRefsTotal(deps.db, crawlJobId, refs);
  // Only a sweep that reached the end may declare listings gone.
  await markStoreStale(deps, store);
  log.info({ refs }, 'discover finished');
  // The fetches may all have finished already (or there were none).
  await checkRunHealth(deps, crawlJobId);
  return { crawlJobId, refs };
}
