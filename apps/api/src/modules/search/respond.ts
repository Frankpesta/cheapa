/**
 * Hits -> SearchResponse (05 §5.3 steps 3-5, 13 §13.5). Data access is injected so the
 * rules run in unit tests without a database.
 */
import type { LiveResult } from '@cheapa/adapters';
import type { SearchResponse } from '@cheapa/core';
import type { VisionResult } from '@cheapa/ml';
import type { ListingRow, ProductRow } from './catalog-search.js';
import {
  isExactImageMatch,
  isLowConfidence,
  lookalikeBand,
  onShelf,
  rankProducts,
  sortLookalikes,
  TEXT_EXACT_MIN,
  variantAmbiguity,
  type Hit,
  type ProductMeta,
  type Ranked,
  type Shelf,
} from './rank.js';
import { detectedFrom, liveProducts, lookalikeCard, productCard, type LiveLink } from './results.js';
import type { SearchOutput } from './search.service.js';

export const MAX_PRODUCTS = 10;
export const MAX_LOOKALIKES = 20;

export interface Ranking {
  kind: 'image' | 'text';
  vision: VisionResult | null;
  query: string | null;
  imageHits: Hit[];
  textVecHits: Hit[];
  ftsHits: Hit[];
  /** The user already chose an item: don't ask again. */
  itemPicked: boolean;
  lookalikeMinSim: number;
  now: Date;
  products: (ids: string[]) => Promise<ProductRow[]>;
  listings: (ids: string[]) => Promise<ListingRow[]>;
  stores: (ids: string[]) => Promise<ReadonlyMap<string, { name: string; tier: number }>>;
  liveSearch: (query: string) => Promise<LiveResult[]>;
  saveLiveLinks: (links: LiveLink[]) => Promise<void>;
  shelfFromText: (query: string) => Shelf;
}

/** What the search paths produced; the rest of Ranking is wiring. */
export type RankingInput = Pick<
  Ranking,
  'kind' | 'vision' | 'query' | 'imageHits' | 'textVecHits' | 'ftsHits' | 'itemPicked'
>;

const ids = (...lists: readonly Hit[][]) => [
  ...new Set(lists.flat().flatMap((h) => (h.productId ? [h.productId] : []))),
];

export async function buildResponse(requestId: string, r: Ranking): Promise<SearchOutput> {
  const rows = new Map((await r.products(ids(r.imageHits, r.textVecHits, r.ftsHits))).map((p) => [p.id, p]));
  const meta = new Map<string, ProductMeta>([...rows.values()].map((p) => [p.id, { ...p, productId: p.id }]));
  const brand = r.vision?.brand;
  const model = r.vision?.model;
  const ranked = rankProducts({ ...r, brand, model }, meta);

  const visual = r.imageHits.length > 0;
  const exact = visual
    ? ranked.filter((x) => isExactImageMatch(x, meta.get(x.productId), brand, model)).slice(0, MAX_PRODUCTS)
    : ranked.filter((x) => x.score >= TEXT_EXACT_MIN).slice(0, MAX_PRODUCTS);
  const exactIds = new Set(exact.map((x) => x.productId));

  const { detected, shelf: visionShelf } = detectedFrom(r.vision, exact[0]?.score ?? 0);
  const shelf = Object.keys(visionShelf).length
    ? visionShelf
    : r.query
      ? r.shelfFromText(r.query)
      : shelfOfBestImage(ranked, meta);
  const similar = visual
    ? ranked
        .filter((x) => !exactIds.has(x.productId) && (x.imageSim ?? 0) >= r.lookalikeMinSim)
        .filter((x) => onShelf(meta.get(x.productId)!, shelf))
    : [];

  const listingRows = await r.listings([...exactIds, ...similar.map((x) => x.productId)]);
  const byProduct = groupBy(listingRows);
  const products = exact.flatMap((x) => {
    const p = rows.get(x.productId);
    const ls = byProduct.get(x.productId) ?? [];
    return p && ls.length ? [productCard(p, ls, x.score, r.now)] : [];
  });
  const lookalikes = sortLookalikes(
    similar.flatMap((x) => {
      const p = rows.get(x.productId);
      const card =
        p && lookalikeCard(p, byProduct.get(x.productId) ?? [], x.imageSim!, lookalikeBand(x.imageSim!));
      return card ? [card] : [];
    }),
  ).slice(0, MAX_LOOKALIKES);

  const lowConfidence = isLowConfidence(exact);
  let liveCount = 0;
  if (lowConfidence && r.query) {
    const live = await liveHits(r, r.query);
    products.push(...live);
    liveCount = live.length;
  }

  const response: SearchResponse = {
    requestId,
    detected,
    ...confirmation(r, exact, meta, rows),
    products,
    lookalikes,
  };
  return {
    response,
    meta: { cacheHit: false, visionProvider: null, lowConfidence, liveCount, query: r.query },
  };
}

function shelfOfBestImage(ranked: readonly Ranked[], meta: ReadonlyMap<string, ProductMeta>): Shelf {
  const best = ranked.find((x) => x.imageSim !== undefined);
  const m = best && meta.get(best.productId);
  return m ? { department: m.department, category: m.category } : {};
}

function groupBy(rows: readonly ListingRow[]): Map<string, ListingRow[]> {
  const out = new Map<string, ListingRow[]>();
  for (const row of rows) {
    if (!row.productId) continue;
    const list = out.get(row.productId) ?? [];
    list.push(row);
    out.set(row.productId, list);
  }
  return out;
}

async function liveHits(r: Ranking, query: string) {
  const results = await r.liveSearch(query);
  const hits = results.flatMap((res) => res.listings.map((listing) => ({ storeId: res.storeId, listing })));
  if (hits.length === 0) return [];
  const stores = await r.stores([...new Set(hits.map((h) => h.storeId))]);
  const { products, links } = liveProducts(hits, stores, query, r.now);
  await r.saveLiveLinks(links);
  return products;
}

/** Several items in the photo -> pick one (13 §13.6); else one model in two variants (5.3 step 5). */
function confirmation(
  r: Ranking,
  exact: readonly Ranked[],
  meta: ReadonlyMap<string, ProductMeta>,
  rows: ReadonlyMap<string, ProductRow>,
): Pick<SearchResponse, 'needsConfirmation'> {
  const items = r.vision?.items ?? [];
  if (r.kind === 'image' && !r.itemPicked && items.length >= 2) {
    return {
      needsConfirmation: {
        kind: 'item',
        question: 'Which one you dey find?',
        options: items.map((item, itemIndex) => ({ label: `The ${item.kind}`, itemIndex })),
      },
    };
  }
  const pair = variantAmbiguity(exact, meta);
  if (!pair) return {};
  return {
    needsConfirmation: {
      kind: 'variant',
      question: 'Which version?',
      options: pair.map((productId) => ({ label: rows.get(productId)?.title ?? '', productId })),
    },
  };
}
