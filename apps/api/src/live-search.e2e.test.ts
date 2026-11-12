/**
 * LiveSearchService inside the real app (03 §3.6): stores come from the catalog, results
 * are cached on redis-cache, and only tier-1 stores with a liveSearch adapter are asked.
 * The adapter is a stand-in for Jiji that answers from the saved search fixture (no
 * network in tests).
 */
import { allAdapters, liveCacheKey, type SourceAdapter } from '@cheapa/adapters';
import { stores } from '@cheapa/db/catalog';
import { Global, Module } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LIVE_ADAPTERS, LiveSearchService } from './modules/search/live-search.service.js';
import { startHarness, type Harness } from './test/harness.js';

const fixture = readFileSync(
  new URL('../../../packages/adapters/src/jiji/__fixtures__/search-satin-slip-dress.json', import.meta.url),
  'utf8',
);
const jijiAdapter = allAdapters.find((a) => a.id === 'jiji')!;

let calls = 0;
const fakeJiji: SourceAdapter = {
  ...jijiAdapter,
  liveSearch(ctx, store, query, limit) {
    calls += 1;
    // Same parsing as the real adapter, fed from the fixture instead of the network.
    const http = {
      get: (url: string) =>
        Promise.resolve({ url, status: 200, headers: {}, body: fixture, notModified: false }),
    };
    return jijiAdapter.liveSearch!({ ...ctx, http }, store, query, limit);
  },
};

@Global()
@Module({ providers: [{ provide: LIVE_ADAPTERS, useValue: [fakeJiji] }], exports: [LIVE_ADAPTERS] })
class FakeLiveAdapters {}

let h: Harness;
let jijiId: string;
beforeAll(async () => {
  h = await startHarness({}, [FakeLiveAdapters]);
  const rows = await h.catalog.db
    .insert(stores)
    .values([
      {
        name: 'Jiji',
        domain: 'jiji.ng',
        platform: 'custom',
        tier: 1,
        status: 'active',
        crawlPolicy: { robotsOk: true, maxRps: 1 },
      },
      // Same adapter domain is impossible, so a paused tier-1 store stands in for "not asked".
      {
        name: 'Paused',
        domain: 'paused.ng',
        platform: 'custom',
        tier: 1,
        status: 'paused',
        crawlPolicy: { robotsOk: true, maxRps: 1 },
      },
    ])
    .returning({ id: stores.id, domain: stores.domain });
  jijiId = rows.find((r) => r.domain === 'jiji.ng')!.id;
});
afterAll(() => h.stop());

describe('LiveSearchService', () => {
  it('asks Jiji once, returns normalized live listings, then serves the cache', async () => {
    const service = h.app.get(LiveSearchService);
    const [first] = await service.search({ query: 'Satin Slip Dress' });
    expect(first).toMatchObject({ storeId: jijiId, outcome: 'live' });
    expect(first!.listings.length).toBe(8);
    expect(first!.listings.some((l) => l.category === 'dresses')).toBe(true);

    const [second] = await service.search({ query: 'satin slip dress' });
    expect(second).toMatchObject({ storeId: jijiId, outcome: 'cache' });
    expect(calls).toBe(1);
  });

  it('caches on redis-cache with a 30-minute TTL', async () => {
    const { Redis } = await import('ioredis');
    const cache = new Redis(h.env.REDIS_CACHE_URL);
    try {
      const ttl = await cache.ttl(liveCacheKey(jijiId, 'satin slip dress'));
      expect(ttl).toBeGreaterThan(1700);
      expect(ttl).toBeLessThanOrEqual(1800);
    } finally {
      cache.disconnect();
    }
  });

  it('returns nothing for an empty query without asking anyone', async () => {
    const before = calls;
    expect(await h.app.get(LiveSearchService).search({ query: '  ' })).toEqual([]);
    expect(calls).toBe(before);
  });
});
