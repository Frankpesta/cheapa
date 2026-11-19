import { describe, expect, it } from 'vitest';
import {
  isExactImageMatch,
  isLowConfidence,
  lookalikeBand,
  onShelf,
  rankProducts,
  sortLookalikes,
  tokenCoverage,
  variantAmbiguity,
  type ProductMeta,
} from './rank.js';

const meta = (productId: string, over: Partial<ProductMeta> = {}): ProductMeta => ({
  productId,
  brand: null,
  model: null,
  department: 'clothing',
  category: 'dresses',
  variant: {},
  ...over,
});
const metas = (...m: ProductMeta[]) => new Map(m.map((x) => [x.productId, x]));

describe('rankProducts', () => {
  it('scores 0.5 visual + 0.5 text when both paths ran, best listing per product', () => {
    const ranked = rankProducts(
      {
        imageHits: [
          { listingId: 'l1', productId: 'a', sim: 0.95 },
          { listingId: 'l2', productId: 'a', sim: 0.8 },
          { listingId: 'l3', productId: 'b', sim: 0.7 },
        ],
        textVecHits: [],
        ftsHits: [{ listingId: 'l3', productId: 'b', title: 'green satin maxi dress' }],
        query: 'green satin maxi dress',
      },
      metas(meta('a'), meta('b')),
    );
    expect(ranked.map((r) => r.productId)).toEqual(['a', 'b']);
    expect(ranked[0]).toMatchObject({ score: 0.5, imageSim: 0.95 });
    expect(ranked[1]!.score).toBeCloseTo(0.5);
  });

  it('uses the one path that ran at full weight, and brand/model adjust the score', () => {
    const ranked = rankProducts(
      {
        imageHits: [],
        textVecHits: [],
        ftsHits: [
          { listingId: 'l1', productId: 'tecno', title: 'Tecno Camon 30 256GB' },
          { listingId: 'l2', productId: 'infinix', title: 'Infinix Camon 30 case' },
        ],
        query: 'Tecno Camon 30',
        brand: 'Tecno',
        model: 'Camon 30',
      },
      metas(
        meta('tecno', { brand: 'Tecno', model: 'Camon 30', department: 'electronics' }),
        meta('infinix', { brand: 'Infinix', department: 'electronics' }),
      ),
    );
    expect(ranked[0]).toMatchObject({ productId: 'tecno', score: 1 });
    expect(ranked[1]!.score).toBeCloseTo(2 / 3 - 0.2);
  });

  it('ignores hits with no product yet', () => {
    expect(
      rankProducts(
        {
          imageHits: [{ listingId: 'x', productId: null, sim: 1 }],
          textVecHits: [],
          ftsHits: [],
          query: null,
        },
        metas(),
      ),
    ).toEqual([]);
  });
});

describe('rules', () => {
  it('exact image match by picture or by brand + model', () => {
    expect(isExactImageMatch({ productId: 'a', score: 0.6, imageSim: 0.93 }, meta('a'))).toBe(true);
    expect(isExactImageMatch({ productId: 'a', score: 0.6, imageSim: 0.9 }, meta('a'))).toBe(false);
    const phone = meta('p', { brand: 'Tecno', model: 'Spark 20' });
    expect(isExactImageMatch({ productId: 'p', score: 0.6, imageSim: 0.5 }, phone, 'tecno', 'spark 20')).toBe(
      true,
    );
  });

  it('keeps lookalikes on the shelf, audience-aware', () => {
    expect(onShelf(meta('a'), { department: 'clothing', category: 'dresses', audience: 'women' })).toBe(true);
    expect(onShelf(meta('a', { category: 'tops' }), { department: 'clothing', category: 'dresses' })).toBe(
      false,
    );
    expect(onShelf(meta('a', { variant: { audience: 'men' } }), { audience: 'women' })).toBe(false);
    expect(onShelf(meta('a', { variant: { audience: 'unisex' } }), { audience: 'women' })).toBe(true);
  });

  it('bands then sorts cheapest first within a band', () => {
    expect(lookalikeBand(0.9)).toBe('very_close');
    expect(lookalikeBand(0.85)).toBe('close');
    const sorted = sortLookalikes([
      { id: 1, band: 'close' as const, cheapestKobo: 100 },
      { id: 2, band: 'very_close' as const, cheapestKobo: 900 },
      { id: 3, band: 'very_close' as const, cheapestKobo: 500 },
    ]);
    expect(sorted.map((c) => c.id)).toEqual([3, 2, 1]);
  });

  it('flags two variants of one model with near-equal scores', () => {
    const m = metas(
      meta('a', { brand: 'Tecno', model: 'Spark 20', variant: { storageGb: 128 } }),
      meta('b', { brand: 'Tecno', model: 'Spark 20', variant: { storageGb: 256 } }),
      meta('c', { brand: 'Tecno', model: 'Spark 30', variant: { storageGb: 256 } }),
    );
    const at = (id: string, score: number) => ({ productId: id, score });
    expect(variantAmbiguity([at('a', 0.9), at('b', 0.87)], m)).toEqual(['a', 'b']);
    expect(variantAmbiguity([at('a', 0.9), at('b', 0.8)], m)).toBeNull();
    expect(variantAmbiguity([at('a', 0.9), at('c', 0.9)], m)).toBeNull();
  });

  it('low confidence: under 3 products or a weak best score', () => {
    const at = (score: number) => ({ productId: String(score), score });
    expect(isLowConfidence([at(0.9), at(0.8)])).toBe(true);
    expect(isLowConfidence([at(0.5), at(0.5), at(0.5)])).toBe(true);
    expect(isLowConfidence([at(0.7), at(0.6), at(0.6)])).toBe(false);
  });

  it('token coverage of the query', () => {
    expect(tokenCoverage('black satin slip dress', 'Black Satin Slip Dress for Women')).toBe(1);
    expect(tokenCoverage('black satin slip dress', 'Red satin skirt')).toBeCloseTo(0.25);
  });
});
