import {
  daysBefore,
  LISTING_OUT_OF_STOCK_DAYS,
  normalizeListing,
  skipReason,
  type NormalizedListing,
} from '@cheapa/core';
import type { Job } from 'bullmq';
import { markUnseenOutOfStock, upsertListings, type EmbedRequest } from '../crawl/listings.js';
import { getStore } from '../crawl/stores.js';
import { refreshProduct } from '../crawl/products.js';
import { jobId, ProcessJob, shortHash, type EmbedJob, type MatchJob } from '../queues.js';
import type { WorkerDeps } from './deps.js';

export interface ProcessResult {
  skipped?: 'missing_store';
  inserted?: number;
  updated?: number;
  changed?: number;
  outdated?: number;
  dropped?: Record<string, number>;
}

/**
 * Normalize -> upsert by (storeId, externalId) -> price_history + `events:price` only on
 * change -> `embed` for new or changed images (02-crawler-core.md 2.4).
 */
export async function runProcess(deps: WorkerDeps, job: Job<ProcessJob>): Promise<ProcessResult> {
  const data = ProcessJob.parse(job.data);
  const store = await getStore(deps.db, data.storeId);
  if (!store) return { skipped: 'missing_store' };
  const log = deps.log.child({
    storeId: store.id,
    jobId: job.id,
    crawlJobId: data.crawlJobId,
    queue: 'process',
  });

  const keep: NormalizedListing[] = [];
  const dropped: Record<string, number> = {};
  for (const raw of data.listings) {
    const listing = normalizeListing(raw);
    const reason = skipReason(listing);
    if (reason) dropped[reason] = (dropped[reason] ?? 0) + 1;
    else keep.push(listing);
  }
  if (keep.length === 0) return { inserted: 0, updated: 0, changed: 0, outdated: 0, dropped };

  const result = await upsertListings(
    deps.db,
    {
      storeId: store.id,
      storeName: store.name,
      crawlJobId: data.crawlJobId,
      observedAt: new Date(data.fetchedAt),
    },
    keep,
    async ({ events, embeds }) => {
      await deps.events.publish(events);
      await enqueueEmbeds(deps, embeds);
    },
  );
  // After commit: the match job must see the listing; a lost enqueue heals on the next
  // crawl, which re-queues anything still without a product.
  await enqueueMatches(deps, result.toMatch);
  for (const productId of new Set(result.touchedProducts)) await refreshProduct(deps.db, productId);
  const summary = {
    inserted: result.inserted,
    updated: result.updated,
    changed: result.events.length,
    outdated: result.outdated,
    dropped,
  };
  log.info(summary, 'listings processed');
  return summary;
}

/** One pending match per listing (job id), however many crawls see it unmatched. */
async function enqueueMatches(deps: WorkerDeps, listingIds: readonly string[]): Promise<void> {
  if (listingIds.length === 0) return;
  await deps.queues.match.addBulk(
    listingIds.map((listingId) => ({
      name: 'match',
      data: { listingId } satisfies MatchJob,
      opts: { jobId: jobId('match', listingId) },
    })),
  );
}

/** Job id per listing + image, so the same image is never embedded twice. */
async function enqueueEmbeds(deps: WorkerDeps, embeds: readonly EmbedRequest[]): Promise<void> {
  if (embeds.length === 0) return;
  await deps.queues.embed.addBulk(
    embeds.map((e) => ({
      name: 'embed',
      data: e satisfies EmbedJob,
      opts: { jobId: jobId('embed', e.listingId, shortHash(e.imageUrl)) },
    })),
  );
}

/**
 * Runs after a successful store sweep: listings unseen for 7 days go out of stock.
 * (Hidden-from-search after 30 days is a query-time filter, LISTING_HIDDEN_DAYS.)
 */
export async function markStoreStale(deps: WorkerDeps, store: { id: string; name: string }): Promise<number> {
  const now = deps.now?.() ?? new Date();
  const products = new Set<string>();
  const count = await markUnseenOutOfStock(
    deps.db,
    store,
    daysBefore(now, LISTING_OUT_OF_STOCK_DAYS),
    now,
    async (events) => {
      for (const e of events) if (e.productId) products.add(e.productId);
      await deps.events.publish(events);
    },
  );
  // Out-of-stock listings leave their products' price range.
  for (const productId of products) await refreshProduct(deps.db, productId);
  if (count > 0) deps.log.info({ storeId: store.id, count }, 'unseen listings marked out of stock');
  return count;
}
