/**
 * Results view-model (Results.dc.html, 06 §6.3). Pure functions over the API response so
 * the screen stays thin and the rules are unit-tested.
 */
import type { Condition, SearchListing, SearchResponse } from '@cheapa/core/client';
import type { ListingFlag } from '../components';

type Product = SearchResponse['products'][number];
type Detected = SearchResponse['detected'];

export type ConditionFilter = 'all' | 'new' | 'used';

/** "unknown" reads as new everywhere in the UI (ConditionPill); refurbished sits with used. */
export const isNew = (c: Condition) => c === 'new' || c === 'unknown';

const CONDITION_WORD: Record<Condition, string> = {
  new: 'New',
  unknown: 'New',
  used: 'Used',
  uk_used: 'UK used',
  refurbished: 'Refurbished',
};

export interface ListingView {
  listing: SearchListing;
  flag?: ListingFlag;
  best: boolean;
}

/**
 * Display order: the API's order (in stock, then cheapest) with listings we doubt
 * ("Check seller") moved last, as the disclosure says. Sponsored rows are labelled and
 * never moved (CLAUDE.md rule 7).
 */
export function listingViews(listings: readonly SearchListing[]): ListingView[] {
  const best = cheapest(listings, 'new');
  const views = listings.map((l): ListingView => {
    const flag: ListingFlag | undefined = l.flags.sponsored
      ? 'sponsored'
      : l.flags.suspectLow
        ? 'warn'
        : l === best
          ? 'cheapest'
          : l.flags.live
            ? 'live'
            : undefined;
    return { listing: l, best: l === best, ...(flag ? { flag } : {}) };
  });
  return [...views.filter((v) => v.flag !== 'warn'), ...views.filter((v) => v.flag === 'warn')];
}

/** Cheapest in-stock listing on one side of the new/used split, ignoring doubtful prices. */
export function cheapest(listings: readonly SearchListing[], side: 'new' | 'used'): SearchListing | null {
  let found: SearchListing | null = null;
  for (const l of listings) {
    if (!l.inStock || l.flags.suspectLow || isNew(l.condition) !== (side === 'new')) continue;
    if (!found || l.priceKobo < found.priceKobo) found = l;
  }
  return found;
}

export function filterListings(views: readonly ListingView[], f: ConditionFilter): ListingView[] {
  if (f === 'all') return [...views];
  return views.filter((v) => isNew(v.listing.condition) === (f === 'new'));
}

export function conditionCounts(listings: readonly SearchListing[]): Record<ConditionFilter, number> {
  const fresh = listings.filter((l) => isNew(l.condition)).length;
  return { all: listings.length, new: fresh, used: listings.length - fresh };
}

/** Header line: "7 listings · 5 stores". */
export function countsLine(listings: readonly SearchListing[]): string {
  const stores = new Set(listings.map((l) => l.storeName)).size;
  const n = listings.length;
  return `${n} ${n === 1 ? 'listing' : 'listings'} · ${stores} ${stores === 1 ? 'store' : 'stores'}`;
}

/** Summary card notes: "at Slot", "UK used · Jiji". */
export function summaryNotes(listings: readonly SearchListing[]) {
  const n = cheapest(listings, 'new');
  const u = cheapest(listings, 'used');
  return {
    newPrice: n ? { kobo: n.priceKobo, note: `at ${n.storeName}` } : null,
    usedPrice: u ? { kobo: u.priceKobo, note: `${CONDITION_WORD[u.condition]} · ${u.storeName}` } : null,
  };
}

/** "8GB / 256GB · black": the variant facts worth showing under the detected name. */
export function variantLine(v: Detected['variant']): string | undefined {
  if (!v) return undefined;
  const parts: string[] = [];
  if (v.ramGb && v.storageGb) parts.push(`${v.ramGb}GB / ${v.storageGb}GB`);
  else if (v.storageGb) parts.push(`${v.storageGb}GB`);
  if (v.screenInches) parts.push(`${v.screenInches}"`);
  if (v.colours?.length) parts.push(v.colours.join(', ').toLowerCase());
  if (v.material) parts.push(v.material);
  return parts.length ? parts.join(' · ') : undefined;
}

/** What we think the photo shows: brand + model, else the first item's description. */
export function detectedName(d: Detected, fallback?: string): string {
  const named = [d.brand, d.model].filter(Boolean).join(' ');
  if (named) return named;
  const text = d.items?.[0]?.description ?? fallback ?? d.category;
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'This product';
}

/** Confidence badge on the Searching screen; null hides it. */
export function confidenceLabel(c: number): string | null {
  if (c >= 0.8) return 'High match confidence';
  if (c >= 0.6) return 'Good match confidence';
  return null;
}

/**
 * The product the screen shows: the one picked in the Confirm sheet, else the best match.
 * Null when there is no exact match (lookalikes or the empty state take over).
 */
export function primaryProduct(res: SearchResponse, pickedId?: string | null): Product | null {
  if (pickedId) {
    const picked = res.products.find((p) => p.productId === pickedId);
    if (picked) return picked;
  }
  return res.products[0] ?? null;
}

/** The empty state shows only when there is nothing at all to compare. */
export const isEmpty = (res: SearchResponse) => res.products.length === 0 && res.lookalikes.length === 0;

/**
 * Live-search products (all listings fetched just now, 05 §5.3) aren't in the catalog yet,
 * so they have no product page or price history to link to.
 */
export const isLiveOnly = (p: Product) =>
  p.listings.length > 0 && p.listings.every((l) => l.flags.live === true);
