/**
 * Turns catalog rows, live-store hits and the vision read into the shared SearchResponse
 * shapes (@cheapa/core api.ts). Pure.
 */
import {
  Audience,
  classify,
  listingFlags,
  Variant,
  type NormalizedListing,
  type SearchResponse,
} from '@cheapa/core';
import type { VisionResult } from '@cheapa/ml';
import { createHash } from 'node:crypto';
import { LISTINGS_PER_PRODUCT, type ListingRow, type ProductRow } from './catalog-search.js';
import { tokenCoverage, type Shelf } from './rank.js';

type SearchProduct = SearchResponse['products'][number];
type SearchListing = SearchProduct['listings'][number];
type Lookalike = SearchResponse['lookalikes'][number];
export type Detected = SearchResponse['detected'];

const goUrl = (listingId: string) => `/go/${listingId}`;

function listingCard(l: ListingRow, now: Date): SearchListing {
  const sizes = l.variant.sizes?.map((s) => s.value);
  return {
    listingId: l.id,
    storeName: l.storeName,
    storeTier: l.storeTier,
    priceKobo: l.priceKobo,
    priceKind: l.priceKind,
    ...(l.priceMaxKobo != null ? { priceMaxKobo: l.priceMaxKobo } : {}),
    ...(l.oldPriceKobo != null ? { oldPriceKobo: l.oldPriceKobo } : {}),
    condition: l.condition,
    inStock: l.inStock,
    ...(sizes?.length ? { sizes } : {}),
    ...(l.variant.packCount ? { packCount: l.variant.packCount } : {}),
    lastSeenAt: l.lastSeenAt.toISOString(),
    url: goUrl(l.id),
    flags: listingFlags(l, now),
  };
}

export function productCard(
  p: ProductRow,
  rows: readonly ListingRow[],
  score: number,
  now: Date,
): SearchProduct {
  return {
    productId: p.id,
    slug: p.slug,
    title: p.title,
    department: p.department,
    repImageUrl: p.repImageUrl,
    ...(p.cheapestNewKobo != null ? { cheapestNewKobo: p.cheapestNewKobo } : {}),
    ...(p.cheapestUsedKobo != null ? { cheapestUsedKobo: p.cheapestUsedKobo } : {}),
    listingCount: p.listingCount,
    matchScore: Math.round(score * 1000) / 1000,
    listings: byStockThenPrice(rows)
      .slice(0, LISTINGS_PER_PRODUCT)
      .map((l) => listingCard(l, now)),
  };
}

/** In stock first, then cheapest first (rule 7: price order within a product). */
export function byStockThenPrice<T extends { inStock: boolean; priceKobo: number }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.priceKobo - b.priceKobo);
}

/** One card per product: its cheapest in-stock listing. Null when nothing is in stock. */
export function lookalikeCard(
  p: ProductRow,
  rows: readonly ListingRow[],
  similarity: number,
  band: Lookalike['band'],
): Lookalike | null {
  const cheapest = byStockThenPrice(rows).find((l) => l.inStock);
  if (!cheapest) return null;
  return {
    productId: p.id,
    title: p.title,
    repImageUrl: p.repImageUrl,
    cheapestKobo: cheapest.priceKobo,
    priceKind: cheapest.priceKind,
    storeName: cheapest.storeName,
    listingCount: Math.max(1, p.listingCount),
    similarity: Math.round(Math.min(1, similarity) * 1000) / 1000,
    band,
  };
}

/** Stable uuid-shaped id for a live listing (not in the catalog yet): sha1 of store + external id. */
export function liveListingId(storeId: string, externalId: string): string {
  const h = createHash('sha1').update(`live:${storeId}:${externalId}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface LiveLink {
  listingId: string;
  storeId: string;
  externalId: string;
  sourceUrl: string;
}

/**
 * Live-store hits as single-listing products after the indexed ones (flag `live`).
 * Match quality is the query's token coverage of the title.
 */
export function liveProducts(
  hits: readonly { storeId: string; listing: NormalizedListing }[],
  stores: ReadonlyMap<string, { name: string; tier: number }>,
  query: string,
  now: Date,
): { products: SearchProduct[]; links: LiveLink[] } {
  const products: SearchProduct[] = [];
  const links: LiveLink[] = [];
  for (const { storeId, listing: l } of hits) {
    const store = stores.get(storeId);
    if (!store) continue;
    const id = liveListingId(storeId, l.externalId);
    links.push({ listingId: id, storeId, externalId: l.externalId, sourceUrl: l.sourceUrl });
    const isUsed = ['used', 'uk_used', 'refurbished'].includes(l.condition);
    products.push({
      productId: id,
      slug: `live-${id}`,
      title: l.title,
      department: l.department,
      repImageUrl: l.imageUrl ?? null,
      ...(isUsed ? { cheapestUsedKobo: l.priceKobo } : { cheapestNewKobo: l.priceKobo }),
      listingCount: 1,
      matchScore: Math.round(tokenCoverage(query, l.title) * 1000) / 1000,
      listings: [
        {
          ...listingCard(
            {
              id,
              productId: null,
              storeName: store.name,
              storeTier: store.tier,
              priceKobo: l.priceKobo,
              priceKind: l.priceKind,
              priceMaxKobo: l.priceMaxKobo ?? null,
              oldPriceKobo: l.oldPriceKobo ?? null,
              condition: l.condition,
              inStock: l.inStock,
              variant: l.variant,
              lastSeenAt: now,
              suspectLow: false,
              sponsored: l.sponsored,
            },
            now,
          ),
          flags: { live: true, ...(l.sponsored ? { sponsored: true } : {}) },
        },
      ],
    });
  }
  products.sort(
    (a, b) =>
      b.matchScore - a.matchScore || (a.listings[0]?.priceKobo ?? 0) - (b.listings[0]?.priceKobo ?? 0),
  );
  return { products, links };
}

/** Maps the vision variant (free key/value) onto the catalog Variant; unknown keys drop. */
export function visionVariant(v: Record<string, string>): Variant {
  const audience = Audience.safeParse(v.audience?.toLowerCase());
  const storage = Number.parseInt(v.storage ?? '', 10);
  const ram = Number.parseInt(v.ram ?? '', 10);
  const candidate = {
    ...(v.colour ? { colours: [v.colour] } : {}),
    ...(v.pattern ? { pattern: v.pattern } : {}),
    ...(v.material ? { material: v.material } : {}),
    ...(v.shade ? { shade: v.shade } : {}),
    ...(audience.success ? { audience: audience.data } : {}),
    ...(storage > 0 ? { storageGb: storage } : {}),
    ...(ram > 0 ? { ramGb: ram } : {}),
  };
  const parsed = Variant.safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

export function detectedFrom(
  vision: VisionResult | null,
  confidence: number,
): { detected: Detected; shelf: Shelf } {
  if (!vision?.isProduct) return { detected: { confidence }, shelf: {} };
  const main = vision.items[0];
  const cls = classify([], vision.category ?? main?.kind ?? vision.searchQuery);
  const variant = visionVariant(vision.variant);
  const department = cls.department === 'other' ? undefined : cls.department;
  return {
    detected: {
      ...(vision.brand ? { brand: vision.brand } : {}),
      ...(vision.model ? { model: vision.model } : {}),
      ...(department ? { department } : {}),
      ...(vision.category ? { category: vision.category } : {}),
      ...(Object.keys(variant).length ? { variant } : {}),
      ...(vision.items.length
        ? {
            items: vision.items.map((i) => ({
              kind: i.kind,
              bbox: [i.bbox.x, i.bbox.y, i.bbox.w, i.bbox.h] as [number, number, number, number],
              description: i.description,
            })),
          }
        : {}),
      confidence,
    },
    shelf: {
      ...(department ? { department, category: cls.category } : {}),
      ...(variant.audience ? { audience: variant.audience } : {}),
    },
  };
}
