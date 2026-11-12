/**
 * Catalog events shared by the worker (producer) and the API jobs process (consumer,
 * 08-user-side.md 8.x price alerts). Lives on redis-queue, never redis-cache.
 */
import { z } from 'zod';
import { Kobo, Condition } from './types.js';

/** Redis stream of price/stock changes (02-crawler-core.md 2.4). */
export const PRICE_EVENTS_STREAM = 'events:price';
/** Approximate cap on stream length; consumers lag minutes, not days. */
export const PRICE_EVENTS_MAXLEN = 200_000;

/**
 * One `price.changed` entry. Delivery is at-least-once: consumers dedupe on
 * (listingId, observedAt). `productId` is null until the matcher links the listing,
 * and alert consumers skip those.
 */
export const PriceChangedEvent = z.object({
  type: z.literal('price.changed'),
  listingId: z.uuid(),
  productId: z.uuid().nullable(),
  storeId: z.uuid(),
  storeName: z.string().min(1),
  condition: Condition,
  /** Null for a listing seen for the first time. */
  oldPriceKobo: Kobo.nullable(),
  newPriceKobo: Kobo,
  /** Previous stock state; null for a new listing. */
  wasInStock: z.boolean().nullable(),
  inStock: z.boolean(),
  observedAt: z.iso.datetime(),
});
export type PriceChangedEvent = z.infer<typeof PriceChangedEvent>;

/** Listings unseen this long are marked out of stock after a store sweep. */
export const LISTING_OUT_OF_STOCK_DAYS = 7;
/** Listings unseen this long are hidden from search results. */
export const LISTING_HIDDEN_DAYS = 30;

const DAY_MS = 24 * 3600 * 1000;

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
