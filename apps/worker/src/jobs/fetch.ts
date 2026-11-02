import { parseListings } from '@cheapa/adapters';
import type { Job } from 'bullmq';
import { addItemsFound, canCrawl, getStore, recordCrawlError } from '../crawl/stores.js';
import { FetchJob, type ProcessJob } from '../queues.js';
import { adapterContext, CrawlOutcome, handleCrawlError, type WorkerDeps } from './deps.js';

export interface FetchResult {
  skipped?: 'missing' | 'not_crawlable' | 'robots';
  listings?: number;
  rejected?: number;
}

/** Fetch + parse one ref, validate the listings, and hand them to `process`. */
export async function runFetch(deps: WorkerDeps, job: Job<FetchJob>): Promise<FetchResult> {
  const data = FetchJob.parse(job.data);
  const store = await getStore(deps.db, data.storeId);
  if (!store) return { skipped: 'missing' };
  // Store blocked or paused since discover ran: drop the remaining refs quietly.
  if (!canCrawl(store)) return { skipped: 'not_crawlable' };

  const adapter = deps.registry.get(data.adapterId);
  if (!adapter) throw new CrawlOutcome(`adapter ${data.adapterId} is not registered`, true);
  const log = deps.log.child({
    storeId: store.id,
    jobId: job.id,
    crawlJobId: data.crawlJobId,
    queue: 'fetch',
  });

  let parsed: ReturnType<typeof parseListings>;
  let fetchedAt: string;
  try {
    const raw = await adapter.fetch(adapterContext(deps, store, log), data.ref);
    fetchedAt = raw.fetchedAt;
    parsed = parseListings(adapter, raw, store);
  } catch (err) {
    await handleCrawlError(deps, store, data.crawlJobId, err, 'fetch');
    return { skipped: 'robots' };
  }

  const { listings, rejected } = parsed;
  if (rejected.length > 0) {
    // Field paths and messages only: never the rejected values themselves.
    const first = rejected[0]!;
    await recordCrawlError(deps.db, data.crawlJobId, {
      kind: 'invalid_listing',
      url: data.ref.url,
      message: `${rejected.length} rejected; first: ${first.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    });
    log.warn({ rejected: rejected.length }, 'adapter emitted invalid listings');
  }
  await addItemsFound(deps.db, data.crawlJobId, listings.length);
  if (listings.length > 0) {
    const next: ProcessJob = { storeId: store.id, crawlJobId: data.crawlJobId, fetchedAt, listings };
    await deps.queues.process.add('process', next);
  }
  return { listings: listings.length, rejected: rejected.length };
}
