/**
 * 05 §5.3 search pipeline on real Postgres + pgvector with fake models: exact matches,
 * lookalike bands and shelf, stale/blocked listings hidden, item chips, result and
 * vision caches, full-text search.
 */
import { DEVICE_HEADER, SearchResponse } from '@cheapa/core';
import { canonicalProducts, listingEmbeddings, listings, stores } from '@cheapa/db/catalog';
import type { EmbedService, VisionResult, VisionService } from '@cheapa/ml';
import { Global, Module, type Type } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEARCH_ML_OVERRIDE } from './modules/search/search.module.js';
import type { SearchMl } from './modules/search/search-ml.js';
import { type Harness, multipart, pngBytes, startHarness } from './test/harness.js';

const MODEL = 'test-v1';
/** Unit vector at angle acos(cos) from e0 in the e0/e1 plane: cosine to e0 is exactly `cos`. */
function vec(dims: number, cos: number): number[] {
  const v = new Array<number>(dims).fill(0);
  v[0] = cos;
  v[1] = Math.sqrt(1 - cos * cos);
  return v;
}

const calls = { vision: 0, embedImage: 0 };
const visionResult: VisionResult = {
  isProduct: true,
  category: 'maxi dress',
  brand: null,
  model: null,
  modelNumber: null,
  variant: { colour: 'emerald green', material: 'satin', audience: 'women' },
  visibleText: ['18.5k'],
  priceSeen: 1_850_000,
  searchQuery: 'emerald satin maxi dress',
  confidence: 0.85,
  items: [
    { kind: 'dress', description: 'satin maxi', bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.8 } },
    { kind: 'bag', description: 'gold clutch', bbox: { x: 0.6, y: 0.6, w: 0.3, h: 0.3 } },
  ],
};
const embed: EmbedService = {
  modelVersion: MODEL,
  imageDims: 768,
  textDims: 384,
  embedListing: () => {
    calls.embedImage++;
    return Promise.resolve({ imageVec: vec(768, 1), textVec: null, phash: 0n });
  },
  embedTitle: () => Promise.resolve(vec(384, 1)),
  warmUp: () => Promise.resolve(),
};
const vision: VisionService = {
  describe: () => {
    calls.vision++;
    return Promise.resolve({
      status: 'ok',
      providerId: 'fake',
      result: visionResult,
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0, latencyMs: 1 },
    });
  },
};

function fakeMl(ml: SearchMl): Type {
  @Global()
  @Module({ providers: [{ provide: SEARCH_ML_OVERRIDE, useValue: ml }], exports: [SEARCH_ML_OVERRIDE] })
  class FakeMlModule {}
  return FakeMlModule;
}

let h: Harness;
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = await startHarness({}, [fakeMl({ embed, vision })]);
  const { db } = h.catalog;
  const [shop, blocked] = await db
    .insert(stores)
    .values([
      { name: 'Shop', domain: 'shop.test', platform: 'custom', tier: 2, status: 'active' },
      { name: 'Gone', domain: 'gone.test', platform: 'custom', tier: 2, status: 'blocked' },
    ])
    .returning({ id: stores.id });

  const products = [
    { key: 'exact', title: 'Emerald Satin Maxi Dress', department: 'clothing', category: 'dresses' },
    { key: 'veryClose', title: 'Green Silk Maxi Dress', department: 'clothing', category: 'dresses' },
    { key: 'close', title: 'Olive Midi Dress', department: 'clothing', category: 'dresses' },
    { key: 'offShelf', title: 'Green Satin Clutch', department: 'bags_accessories', category: 'handbags' },
  ] as const;
  for (const p of products) {
    const [row] = await db
      .insert(canonicalProducts)
      .values({
        slug: p.key,
        title: p.title,
        department: p.department,
        category: p.category,
        listingCount: 1,
      })
      .returning({ id: canonicalProducts.id });
    ids[p.key] = row!.id;
  }

  const days = (n: number) => new Date(Date.now() - n * 86_400_000);
  const rows = [
    { key: 'exact', store: shop, ext: 'e1', price: 3_000_000, sim: 0.97, seen: days(0) },
    { key: 'exact', store: shop, ext: 'e2', price: 2_500_000, sim: 0.96, seen: days(1) },
    { key: 'exact', store: shop, ext: 'e3', price: 1_000_000, sim: 0.96, seen: days(10) }, // stale
    { key: 'exact', store: blocked, ext: 'e4', price: 900_000, sim: 0.96, seen: days(0) }, // blocked
    { key: 'veryClose', store: shop, ext: 'v1', price: 2_000_000, sim: 0.91, seen: days(0) },
    { key: 'close', store: shop, ext: 'c1', price: 1_200_000, sim: 0.84, seen: days(0) },
    { key: 'offShelf', store: shop, ext: 'o1', price: 500_000, sim: 0.88, seen: days(0) },
  ];
  for (const r of rows) {
    const p = products.find((x) => x.key === r.key)!;
    const [l] = await db
      .insert(listings)
      .values({
        storeId: r.store!.id,
        externalId: r.ext,
        sourceUrl: `https://shop.test/${r.ext}`,
        title: p.title,
        department: p.department,
        category: p.category,
        priceKobo: r.price,
        inStock: true,
        canonicalProductId: ids[r.key],
        lastSeenAt: r.seen,
      })
      .returning({ id: listings.id });
    ids[r.ext] = l!.id;
    await db.insert(listingEmbeddings).values({
      listingId: l!.id,
      imageVec: vec(768, r.sim),
      textVec: vec(384, r.key === 'exact' ? 0.9 : 0.5),
      modelVersion: MODEL,
    });
  }
});

afterAll(async () => {
  await h?.stop();
});

/** Fields go before the file: @fastify/multipart only exposes fields read before it. */
function imageSearch(fields: Record<string, string> = {}) {
  const body = multipart([
    ...Object.entries(fields).map(([name, value]) => ({ name, value })),
    { name: 'image', value: pngBytes(), filename: 'shot.png', type: 'image/png' },
  ]);
  return h.app.inject({
    method: 'POST',
    url: '/search/image',
    payload: body.payload,
    headers: { ...body.headers, [DEVICE_HEADER]: randomUUID() },
  });
}

describe('POST /search/image', () => {
  it('returns the exact product, cheapest first, then lookalikes by band and price', async () => {
    const res = await imageSearch();
    expect(res.statusCode).toBe(200);
    const body = SearchResponse.parse(res.json());

    expect(body.products.map((p) => p.productId)).toEqual([ids.exact]);
    // Stale (10 days) and blocked-store listings are left out.
    expect(body.products[0]!.listings.map((l) => [l.listingId, l.priceKobo, l.url])).toEqual([
      [ids.e2, 2_500_000, `/go/${ids.e2}`],
      [ids.e1, 3_000_000, `/go/${ids.e1}`],
    ]);
    // The clutch is visually close but on another shelf than the detected dress.
    expect(body.lookalikes.map((l) => [l.productId, l.band])).toEqual([
      [ids.veryClose, 'very_close'],
      [ids.close, 'close'],
    ]);
    expect(body.detected).toMatchObject({
      department: 'clothing',
      category: 'maxi dress',
      variant: { colours: ['emerald green'], material: 'satin', audience: 'women' },
    });
    expect(body.needsConfirmation).toMatchObject({
      kind: 'item',
      options: [{ itemIndex: 0 }, { itemIndex: 1 }],
    });
  });

  it('serves a repeat upload from cache with its own request id', async () => {
    const before = { ...calls };
    const firstRes = await imageSearch();
    expect(firstRes.statusCode).toBe(200);
    const first = firstRes.json<SearchResponse>();
    const again = (await imageSearch()).json<SearchResponse>();
    expect(calls).toEqual(before);
    expect(again.requestId).not.toBe(first.requestId);
    expect({ ...again, requestId: '' }).toEqual({ ...first, requestId: '' });
  });

  it('re-searches a picked item without another vision call and without the chips', async () => {
    const before = calls.vision;
    const res = await imageSearch({ item: '1' });
    expect(res.statusCode).toBe(200);
    const body = res.json<SearchResponse>();
    expect(calls.vision).toBe(before);
    expect(body.needsConfirmation).toBeUndefined();
  });

  it('rejects a bad item index', async () => {
    expect((await imageSearch({ item: '12' })).statusCode).toBe(400);
  });
});

describe('POST /search/text', () => {
  it('finds products by full text and title vectors', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/search/text',
      payload: { query: 'emerald satin maxi dress' },
    });
    expect(res.statusCode).toBe(200);
    const body = SearchResponse.parse(res.json());
    expect(body.products[0]?.productId).toBe(ids.exact);
    expect(body.products.map((p) => p.productId)).not.toContain(ids.offShelf);
    expect(body.lookalikes).toEqual([]);
  });
});
