/**
 * The `match` consumer (04 §4.3): one listing in, attached to an existing canonical
 * product, queued for review, or founding a new one. Decision logic: @cheapa/core.
 */
import { decideMatch, DEFAULT_THRESHOLDS, type MatchThresholds } from '@cheapa/core';
import type { Job } from 'bullmq';
import {
  applyDecision,
  findCandidates,
  loadMatchListing,
  lockCategory,
  refreshProduct,
} from '../crawl/products.js';
import { MatchJob } from '../queues.js';
import type { WorkerDeps } from './deps.js';

export interface MatchResult {
  skipped?: 'missing' | 'already_matched';
  decision?: 'merge' | 'review' | 'new';
  productId?: string;
  score?: number;
}

export async function runMatch(deps: WorkerDeps, job: Job<MatchJob>): Promise<MatchResult> {
  const { listingId } = MatchJob.parse(job.data);
  const thresholds: MatchThresholds = deps.matchThresholds ?? DEFAULT_THRESHOLDS;
  const result = await deps.db.transaction(async (tx): Promise<MatchResult> => {
    const listing = await loadMatchListing(tx, listingId);
    if (!listing) return { skipped: 'missing' };
    if (listing.canonicalProductId) return { skipped: 'already_matched' };
    await lockCategory(tx, listing);
    const decision = decideMatch(listing, await findCandidates(tx, listing), thresholds);
    const productId = await applyDecision(tx, listing, decision);
    await refreshProduct(tx, productId);
    return { decision: decision.kind, productId, score: decision.score };
  });
  if (result.decision) deps.log.debug({ jobId: job.id, listingId, ...result }, 'listing matched');
  return result;
}
