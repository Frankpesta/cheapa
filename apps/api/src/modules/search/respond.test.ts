import type { NormalizedListing } from '@cheapa/core';
import type { VisionResult } from '@cheapa/ml';
import { describe, expect, it, vi } from 'vitest';
import type { ListingRow, ProductRow } from './catalog-search.js';
import { buildResponse, type Ranking } from './respond.js';
import { liveListingId } from './results.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = new Date('2026-11-19T12:00:00Z');

const product = (n: number, over: Partial<ProductRow> = {}): ProductRow => ({
  id: uuid(n),
  slug: `p-${n}`,
  title: `Product ${n}`,
  brand: null,
  model: null,
  department: 'clothing',
  category: 'dresses',
  variant: {},
  repImageUrl: null,
  cheapestNewKobo: null,
  cheapestUsedKobo: null,
  listingCount: 1,
  ...over,
});

const listing = (
  n: number,
  productN: number,
  priceKobo: number,
  over: Partial<ListingRow> = {},
): ListingRow => ({
  id: uuid(100 + n),
  productId: uuid(productN),
  storeName: 'Jiji',
  storeTier: 1,
  priceKobo,
  priceKind: 'exact',
  priceMaxKobo: null,
  oldPriceKobo: null,
  condition: 'new',
  inStock: true,
  variant: {},
  lastSeenAt: now,
  suspectLow: false,
  sponsored: false,
  ...over,
});

const vision = (over: Partial<VisionResult> = {}): VisionResult => ({
  isProduct: true,
  category: 'maxi dress',
  brand: null,
  model: null,
  modelNumber: null,
  variant: { audience: 'women' },
  visibleText: [],
  priceSeen: null,
  searchQuery: 'green satin maxi dress',
  confidence: 0.8,
  items: [{ kind: 'dress', description: '', bbox: { x: 0, y: 0, w: 0.5, h: 0.8 } }],
  ...over,
});

function ranking(products: ProductRow[], listings: ListingRow[], over: Partial<Ranking> = {}): Ranking {
  return {
    kind: 'image',
    vision: vision(),
    query: 'green satin maxi dress',
    imageHits: [],
    textVecHits: [],
    ftsHits: [],
    itemPicked: false,
    lookalikeMinSim: 0.8,
    now,
    products: (ids) => Promise.resolve(products.filter((p) => ids.includes(p.id))),
    listings: (ids) => Promise.resolve(listings.filter((l) => l.productId && ids.includes(l.productId))),
    stores: () => Promise.resolve(new Map([['s1', { name: 'Jumia', tier: 1 }]])),
    liveSearch: () => Promise.resolve([]),
    saveLiveLinks: () => Promise.resolve(),
    shelfFromText: () => ({}),
    ...over,
  };
}

const hit = (productN: number, sim: number) => ({
  listingId: uuid(500 + productN),
  productId: uuid(productN),
  sim,
});

describe('buildResponse (image)', () => {
  it('splits exact matches from lookalikes; lookalikes by band, then price, on the shelf only', async () => {
    const products = [
      product(1, { title: 'The dress' }),
      product(2),
      product(3),
      product(4),
      product(5, { category: 'tops' }),
    ];
    const listings = [
      listing(1, 1, 3_000_000),
      listing(2, 1, 2_500_000),
      listing(3, 2, 2_000_000),
      listing(4, 3, 1_500_000),
      listing(5, 4, 900_000),
      listing(6, 5, 100_000),
    ];
    const r = ranking(products, listings, {
      imageHits: [hit(1, 0.96), hit(2, 0.88), hit(3, 0.91), hit(4, 0.82), hit(5, 0.89)],
    });
    const { response } = await buildResponse('req-1', r);
    expect(response.products.map((p) => p.productId)).toEqual([uuid(1)]);
    // Cheapest first within the product.
    expect(response.products[0]!.listings.map((l) => l.priceKobo)).toEqual([2_500_000, 3_000_000]);
    expect(response.products[0]!.listings[0]!.url).toBe(`/go/${uuid(102)}`);
    // Very close (3) before close (4 cheaper than 2); product 5 is a top, off the dress shelf.
    expect(response.lookalikes.map((l) => [l.productId, l.band])).toEqual([
      [uuid(3), 'very_close'],
      [uuid(4), 'close'],
      [uuid(2), 'close'],
    ]);
    expect(response.detected).toMatchObject({ department: 'clothing', category: 'maxi dress' });
  });

  it('asks which item when the photo shows several, unless one was picked', async () => {
    const items = [
      { kind: 'dress', description: '', bbox: { x: 0, y: 0, w: 0.5, h: 0.8 } },
      { kind: 'bag', description: '', bbox: { x: 0.6, y: 0.5, w: 0.3, h: 0.3 } },
    ];
    const r = ranking([], [], { vision: vision({ items }) });
    const { response } = await buildResponse('req', r);
    expect(response.needsConfirmation).toEqual({
      kind: 'item',
      question: 'Which one you dey find?',
      options: [
        { label: 'The dress', itemIndex: 0 },
        { label: 'The bag', itemIndex: 1 },
      ],
    });
    const picked = await buildResponse('req', { ...r, itemPicked: true });
    expect(picked.response.needsConfirmation).toBeUndefined();
  });

  it('adds live store hits when indexed results are weak, and saves their links', async () => {
    const live: NormalizedListing = {
      externalId: 'J1',
      sourceUrl: 'https://jumia.test/j1',
      title: 'Green Satin Maxi Dress',
      priceKobo: 1_800_000,
      priceKind: 'exact',
      currency: 'NGN',
      inStock: true,
      categoryPath: [],
      sponsored: false,
      attributes: {},
      condition: 'new',
      department: 'clothing',
      category: 'dresses',
      variant: {},
      extractionConfidence: 1,
    };
    const saveLiveLinks = vi.fn(() => Promise.resolve());
    const r = ranking([], [], {
      liveSearch: () => Promise.resolve([{ storeId: 's1', outcome: 'ok', listings: [live] }] as never),
      saveLiveLinks,
    });
    const { response, meta } = await buildResponse('req', r);
    const id = liveListingId('s1', 'J1');
    expect(response.products).toHaveLength(1);
    expect(response.products[0]).toMatchObject({ productId: id, matchScore: 1, cheapestNewKobo: 1_800_000 });
    expect(response.products[0]!.listings[0]).toMatchObject({
      storeName: 'Jumia',
      url: `/go/${id}`,
      flags: { live: true },
    });
    expect(saveLiveLinks).toHaveBeenCalledWith([
      { listingId: id, storeId: 's1', externalId: 'J1', sourceUrl: 'https://jumia.test/j1' },
    ]);
    expect(meta).toMatchObject({ lowConfidence: true, liveCount: 1 });
  });
});

describe('buildResponse (text)', () => {
  it('returns products above the text bar and no lookalikes', async () => {
    const products = [product(1, { title: 'Black satin slip dress' }), product(2)];
    const listings = [listing(1, 1, 1_000_000), listing(2, 2, 500_000)];
    const r = ranking(products, listings, {
      kind: 'text',
      vision: null,
      query: 'black satin slip dress',
      ftsHits: [
        { listingId: uuid(101), productId: uuid(1), title: 'Black Satin Slip Dress' },
        { listingId: uuid(102), productId: uuid(2), title: 'Red cotton shirt dress' },
      ],
    });
    const { response } = await buildResponse('req', r);
    expect(response.products.map((p) => p.productId)).toEqual([uuid(1)]);
    expect(response.lookalikes).toEqual([]);
  });
});
