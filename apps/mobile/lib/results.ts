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

// ---------------------------------------------------------------------------
// Filters (06 §6.3): condition chips on the screen; size, colour, store and stock in the
// filter sheet. Options come from the listings themselves, so nothing offered is empty.
// ---------------------------------------------------------------------------

export interface ListingFilters {
  condition: ConditionFilter;
  sizes: readonly string[];
  colours: readonly string[];
  stores: readonly string[];
  inStockOnly: boolean;
}

export const noFilters = (condition: ConditionFilter = 'all'): ListingFilters => ({
  condition,
  sizes: [],
  colours: [],
  stores: [],
  inStockOnly: false,
});

export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptions {
  sizes: FilterOption[];
  colours: FilterOption[];
  stores: FilterOption[];
  outOfStock: number;
}

/** Letter sizes in wearing order; anything else (EU 38, UK 6, 32") sorts by its number. */
const LETTER_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];

function sizeRank(s: string): [number, number, string] {
  const letter = LETTER_SIZES.indexOf(s.toUpperCase());
  if (letter >= 0) return [0, letter, s];
  const n = Number.parseFloat(s.replace(/^[^\d]+/, ''));
  return Number.isFinite(n) ? [1, n, s] : [2, 0, s];
}

function compareSize(a: string, b: string): number {
  const [ga, na, sa] = sizeRank(a);
  const [gb, nb, sb] = sizeRank(b);
  return ga - gb || na - nb || sa.localeCompare(sb);
}

/** Colours are matched case-blind ("black" = "Black"); the first spelling seen is shown. */
const colourKey = (c: string) => c.trim().toLowerCase();

function tally(values: Iterable<string>, key: (v: string) => string = (v) => v): Map<string, FilterOption> {
  const out = new Map<string, FilterOption>();
  for (const v of values) {
    const k = key(v);
    const hit = out.get(k);
    if (hit) hit.count += 1;
    else out.set(k, { value: v, count: 1 });
  }
  return out;
}

export function filterOptions(listings: readonly SearchListing[]): FilterOptions {
  const sizes = [...tally(listings.flatMap((l) => [...new Set(l.sizes ?? [])])).values()].sort((a, b) =>
    compareSize(a.value, b.value),
  );
  const colours = [
    ...tally(
      listings.flatMap((l) => [...new Set((l.colours ?? []).map((c) => c.trim()))]),
      colourKey,
    ).values(),
  ].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  const stores = [...tally(listings.map((l) => l.storeName)).values()].sort(
    (a, b) => b.count - a.count || a.value.localeCompare(b.value),
  );
  return { sizes, colours, stores, outOfStock: listings.filter((l) => !l.inStock).length };
}

/** Within one group the choices are OR ("M or L"); across groups AND. */
export function matchesFilters(l: SearchListing, f: ListingFilters): boolean {
  if (f.condition !== 'all' && isNew(l.condition) !== (f.condition === 'new')) return false;
  if (f.inStockOnly && !l.inStock) return false;
  if (f.stores.length && !f.stores.includes(l.storeName)) return false;
  if (f.sizes.length && !l.sizes?.some((s) => f.sizes.includes(s))) return false;
  if (f.colours.length) {
    const want = new Set(f.colours.map(colourKey));
    if (!l.colours?.some((c) => want.has(colourKey(c)))) return false;
  }
  return true;
}

export function applyFilters(views: readonly ListingView[], f: ListingFilters): ListingView[] {
  return views.filter((v) => matchesFilters(v.listing, f));
}

/** Sheet filters in use (the badge on the filter chip); condition has its own chips. */
export function sheetFilterCount(f: ListingFilters): number {
  return f.sizes.length + f.colours.length + f.stores.length + (f.inStockOnly ? 1 : 0);
}

/** Listings per condition chip, after the sheet filters, so the counts match what shows. */
export function filteredConditionCounts(
  listings: readonly SearchListing[],
  f: ListingFilters,
): Record<ConditionFilter, number> {
  return conditionCounts(listings.filter((l) => matchesFilters(l, { ...f, condition: 'all' })));
}

// ---------------------------------------------------------------------------
// Price lines (06 §6.3): "From ₦X" stays "From", ranges show both ends, packs show each.
// ---------------------------------------------------------------------------

export interface PriceText {
  /** "From" for a from-price, else null. */
  prefix: string | null;
  /** Upper end of a range ("– ₦12,000"), else null. */
  upTo: number | null;
  /** "2-pack, ₦3,676 each", else null. */
  perItem: string | null;
}

export function priceText(
  l: Pick<SearchListing, 'priceKind' | 'priceKobo' | 'priceMaxKobo' | 'packCount'>,
  format: (kobo: number) => string,
): PriceText {
  const range = l.priceKind === 'range' && l.priceMaxKobo != null && l.priceMaxKobo > l.priceKobo;
  const pack = l.packCount && l.packCount > 1 ? l.packCount : null;
  return {
    prefix: l.priceKind === 'from' || (l.priceKind === 'range' && !range) ? 'From' : null,
    upTo: range ? (l.priceMaxKobo ?? null) : null,
    perItem: pack ? `${pack}-pack, ${format(Math.round(l.priceKobo / pack))} each` : null,
  };
}
