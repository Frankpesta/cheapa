/**
 * Listing trust flags shown in results (04 §4.5). `suspectLow` is computed with the product
 * (catalog refresh); staleness depends on the clock, so it's computed when results are built.
 */
import type { z } from 'zod';
import type { ListingFlags } from './api.js';
import { LISTING_HIDDEN_DAYS } from './events.js';

/** Not seen for this long: dimmed in results ("may be gone"). */
export const LISTING_STALE_HOURS = 48;

const HOUR_MS = 3600_000;

export interface FlagInput {
  lastSeenAt: Date;
  suspectLow: boolean;
  sponsored: boolean;
}

export function listingFlags(l: FlagInput, now: Date): z.infer<typeof ListingFlags> {
  return {
    ...(l.suspectLow ? { suspectLow: true } : {}),
    ...(now.getTime() - l.lastSeenAt.getTime() > LISTING_STALE_HOURS * HOUR_MS ? { stale: true } : {}),
    ...(l.sponsored ? { sponsored: true } : {}),
  };
}

/** Not seen for LISTING_HIDDEN_DAYS: left out of results entirely. */
export function isListingHidden(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() > LISTING_HIDDEN_DAYS * 24 * HOUR_MS;
}
