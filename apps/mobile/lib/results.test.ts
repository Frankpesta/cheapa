import type { SearchListing, SearchResponse } from '@cheapa/core/client';
import { describe, expect, it } from 'vitest';
import {
  cheapest,
  conditionCounts,
  countsLine,
  detectedName,
  filterListings,
  isEmpty,
  listingViews,
  primaryProduct,
  summaryNotes,
  variantLine,
} from './results';

let n = 0;
function listing(over: Partial<SearchListing> = {}): SearchListing {
  n += 1;
  return {
    listingId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    storeName: 'Jumia',
    storeTier: 1,
    priceKobo: 1_000_000,
    priceKind: 'exact',
    condition: 'new',
    inStock: true,
    lastSeenAt: '2026-11-19T10:00:00.000Z',
    url: '/go/x',
    flags: {},
    ...over,
  };
}

describe('listingViews', () => {
  it('marks the cheapest in-stock new listing best and moves doubtful prices last', () => {
    const suspect = listing({
      storeName: 'Jiji · Yaba',
      priceKobo: 100,
      condition: 'used',
      flags: { suspectLow: true },
    });
    const used = listing({ storeName: 'Jiji', priceKobo: 500_000, condition: 'uk_used' });
    const slot = listing({ storeName: 'Slot', priceKobo: 900_000 });
    const jumia = listing({ storeName: 'Jumia', priceKobo: 950_000 });
    const views = listingViews([suspect, used, slot, jumia]);
    expect(views.map((v) => v.listing.storeName)).toEqual(['Jiji', 'Slot', 'Jumia', 'Jiji · Yaba']);
    expect(views[1]).toMatchObject({ best: true, flag: 'cheapest' });
    expect(views[3]?.flag).toBe('warn');
  });

  it('labels sponsored and live rows without reordering them', () => {
    const sp = listing({ priceKobo: 2_000_000, flags: { sponsored: true } });
    const live = listing({ priceKobo: 1_500_000, flags: { live: true } });
    const best = listing({ priceKobo: 1_000_000 });
    const views = listingViews([best, live, sp]);
    expect(views.map((v) => v.flag)).toEqual(['cheapest', 'live', 'sponsored']);
  });
});

describe('cheapest and summaries', () => {
  const rows = [
    listing({ storeName: 'Slot', priceKobo: 31_850_000 }),
    listing({ storeName: 'Jumia', priceKobo: 30_000_000, inStock: false }),
    listing({ storeName: 'Jiji', priceKobo: 26_500_000, condition: 'uk_used' }),
  ];

  it('never mixes new and used, and skips out-of-stock rows', () => {
    expect(cheapest(rows, 'new')?.storeName).toBe('Slot');
    expect(cheapest(rows, 'used')?.storeName).toBe('Jiji');
    expect(summaryNotes(rows)).toEqual({
      newPrice: { kobo: 31_850_000, note: 'at Slot' },
      usedPrice: { kobo: 26_500_000, note: 'UK used · Jiji' },
    });
  });

  it('counts by condition and store', () => {
    expect(conditionCounts(rows)).toEqual({ all: 3, new: 2, used: 1 });
    expect(countsLine(rows)).toBe('3 listings · 3 stores');
    expect(countsLine([rows[0]!])).toBe('1 listing · 1 store');
    expect(filterListings(listingViews(rows), 'used')).toHaveLength(1);
  });
});

describe('detected text', () => {
  it('prefers brand + model, then the item description', () => {
    expect(detectedName({ brand: 'Tecno', model: 'Camon 30', confidence: 0.9 })).toBe('Tecno Camon 30');
    expect(
      detectedName({
        confidence: 0.7,
        items: [{ kind: 'dress', bbox: [0, 0, 1, 1], description: 'black satin slip dress' }],
      }),
    ).toBe('Black satin slip dress');
    expect(detectedName({ confidence: 0.2 }, 'red bag')).toBe('Red bag');
  });

  it('formats the variant line', () => {
    expect(variantLine({ ramGb: 8, storageGb: 256, colours: ['Black'] })).toBe('8GB / 256GB · black');
    expect(variantLine({})).toBeUndefined();
  });
});

describe('primaryProduct', () => {
  const product = (id: string) =>
    ({ productId: id, listings: [] }) as unknown as SearchResponse['products'][number];
  const res = {
    requestId: 'r',
    detected: { confidence: 1 },
    products: [product('a'), product('b')],
    lookalikes: [],
  } as SearchResponse;

  it('uses the confirmed pick, else the best match', () => {
    expect(primaryProduct(res)?.productId).toBe('a');
    expect(primaryProduct(res, 'b')?.productId).toBe('b');
    expect(primaryProduct(res, 'zzz')?.productId).toBe('a');
    expect(isEmpty(res)).toBe(false);
    expect(isEmpty({ ...res, products: [] })).toBe(true);
  });
});
