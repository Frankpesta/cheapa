/**
 * The `embed` consumer (05 §5.1): fetch the listing image into memory through PoliteHttp
 * (max 2 MB), embed image + title, phash, store vectors, drop the bytes. Store images are
 * never written to disk or object storage (CLAUDE.md rule 3).
 */
import { Blocked, HttpError, RateDeferred, ResponseTooLarge, RobotsDisallowed } from '@cheapa/adapters';
import { ImageDecodeError, MAX_IMAGE_BYTES } from '@cheapa/ml';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { loadEmbedListing, saveEmbedding } from '../crawl/embeddings.js';
import { getStore, markStoreBlocked } from '../crawl/stores.js';
import { EmbedJob, jobId, type MatchJob } from '../queues.js';
import type { WorkerDeps } from './deps.js';

/** Waits longer than this for the image host's next slot become a delayed job instead. */
export const MAX_SLOT_WAIT_MS = 10_000;

export interface EmbedResult {
  skipped?: 'missing' | 'image_changed' | 'robots' | 'not_found' | 'bad_image';
  embedded?: boolean;
}

/**
 * Embeds, then hands the listing to the matcher (`afterEmbed`) whether or not an image
 * vector came out of it: a dead or forbidden image must not leave a listing unmatched.
 */
export async function runEmbed(deps: WorkerDeps, job: Job<EmbedJob>, token?: string): Promise<EmbedResult> {
  try {
    const result = await embedListing(deps, job, token);
    if (result.skipped !== 'missing' && result.skipped !== 'image_changed') {
      await queueMatchAfterEmbed(deps, job.data.listingId);
    }
    return result;
  } catch (err) {
    if (err instanceof UnrecoverableError) await queueMatchAfterEmbed(deps, job.data.listingId);
    throw err;
  }
}

/** One match per listing after its embed; also called when an embed job fails for good. */
export async function queueMatchAfterEmbed(deps: WorkerDeps, listingId: string): Promise<void> {
  await deps.queues.match.add('match', { listingId, afterEmbed: true } satisfies MatchJob, {
    jobId: jobId('match', listingId, 'embed'),
  });
}

async function embedListing(deps: WorkerDeps, job: Job<EmbedJob>, token?: string): Promise<EmbedResult> {
  const embed = deps.embed;
  if (!embed) throw new Error('embed consumer started without an EmbedService');
  const data = EmbedJob.parse(job.data);
  const listing = await loadEmbedListing(deps.db, data.listingId);
  if (!listing) return { skipped: 'missing' };
  // A newer crawl changed the image again; that change queued its own job.
  if (listing.imageUrl !== data.imageUrl) return { skipped: 'image_changed' };
  const store = await getStore(deps.db, listing.storeId);
  if (!store) return { skipped: 'missing' };
  const log = deps.log.child({ storeId: store.id, jobId: job.id, listingId: listing.id, queue: 'embed' });

  let bytes: Uint8Array;
  try {
    const res = await deps.imagesFor(store, log).getBytes(data.imageUrl, {
      maxBytes: MAX_IMAGE_BYTES,
      maxSlotWaitMs: MAX_SLOT_WAIT_MS,
      signal: deps.signal,
      ...(data.slotAt !== undefined ? { slotAt: data.slotAt } : {}),
    });
    bytes = res.bytes;
  } catch (err) {
    if (err instanceof RateDeferred) {
      // Slot reserved: come back then rather than holding a worker asleep.
      await job.updateData({ ...data, slotAt: err.slotAt });
      await job.moveToDelayed(err.slotAt, token);
      throw new DelayedError();
    }
    const skipped = await imageFetchOutcome(deps, store, err, data.imageUrl);
    if (skipped) return { skipped };
    throw err;
  }

  try {
    const vectors = await embed.embedListing(bytes, listing.title);
    await saveEmbedding(deps.db, listing.id, vectors, embed.modelVersion);
  } catch (err) {
    if (err instanceof ImageDecodeError) return { skipped: 'bad_image' };
    throw err;
  }
  log.debug({ modelVersion: embed.modelVersion }, 'listing embedded');
  return { embedded: true };
}

/**
 * Expected image outcomes. 429 and challenge pages mean the store's servers want us gone:
 * the store is marked blocked and ops alerted, as for pages (CLAUDE.md rule 3). A 403 on
 * one image is not retried and is alerted, but doesn't pause the store: S3-style image
 * hosts answer 403 for deleted files.
 */
async function imageFetchOutcome(
  deps: WorkerDeps,
  store: { id: string; name: string },
  err: unknown,
  url: string,
): Promise<EmbedResult['skipped'] | undefined> {
  if (err instanceof RobotsDisallowed) return 'robots';
  if (err instanceof ResponseTooLarge) return 'bad_image';
  // 404/410 and other 4xx: the image is gone or unusable; retrying won't help.
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) return 'not_found';
  if (err instanceof Blocked && err.reason === 'status_403') {
    await deps.alerter.send({
      kind: 'image_forbidden',
      storeId: store.id,
      message: `${store.name}: image host answered 403; images skipped, store not paused`,
      details: { url },
    });
    throw new UnrecoverableError(err.message);
  }
  if (err instanceof Blocked) {
    await markStoreBlocked(deps.db, store.id);
    await deps.alerter.send({
      kind: 'store_blocked',
      storeId: store.id,
      message: `${store.name} blocked CheapaBot on an image (${err.reason}); store paused as blocked`,
      details: { url },
    });
    throw new UnrecoverableError(err.message);
  }
  return undefined;
}
