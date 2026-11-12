/**
 * Live search (03 §3.6): Jiji's liveSearch against a real saved search response, and the
 * runner's caps, cache, backoff and time budget.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Blocked } from './errors.js';
import { jijiAdapter, searchUrl } from './jiji/index.js';
import { jumiaAdapter } from './jumia/index.js';
import {
  liveBackoffKey,
  liveCacheKey,
  normalizeQuery,
  runLiveSearch,
  type LiveCache,
  type LiveSearchOptions,
} from './live.js';
import { testStore } from './testing.js';
import type { PoliteHttpClient, StoreRef } from './types.js';

const SEARCH = readFileSync(
  new URL('./jiji/__fixtures__/search-satin-slip-dress.json', import.meta.url),
  'utf8',
);
const jiji = testStore({ id: '00000000-0000-4000-8000-0000000000a1', name: 'Jiji', domain: 'jiji.ng' });

function memoryCache(): LiveCache & { store: Map<string, { value: string; ttl: number }> } {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    store,
    get: (k) => Promise.resolve(store.get(k)?.value ?? null),
    set: (k, value, ttl) => Promise.resolve(void store.set(k, { value, ttl })),
  };
}

function http(body = SEARCH, opts: { fail?: Error; delayMs?: number } = {}) {
  const requested: string[] = [];
  const client: PoliteHttpClient = {
    async get(url, init) {
      requested.push(url);
      if (opts.delayMs) {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, opts.delayMs);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(t);
            reject(new Error('aborted'));
          });
        });
      }
      if (opts.fail) throw opts.fail;
      return { url, status: 200, headers: {}, body, notModified: false };
    },
  };
  return { client, requested };
}

function logger() {
  const lines: { level: string; obj: object; msg?: string }[] = [];
  const at = (level: string) => (obj: object, msg?: string) => void lines.push({ level, obj, msg });
  return { lines, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

function options(over: Partial<LiveSearchOptions> & { client?: PoliteHttpClient } = {}): LiveSearchOptions {
  const { client = http().client, ...rest } = over;
  return {
    query: 'Satin Slip Dress',
    targets: [{ store: jiji, adapter: jijiAdapter }],
    httpFor: () => client,
    cache: memoryCache(),
    log: logger(),
    ...rest,
  };
}

describe('jiji liveSearch', () => {
  it('asks Jiji’s listing API and keeps fashion ads with their category breadcrumb', async () => {
    const { client, requested } = http();
    const [result] = await runLiveSearch(options({ client }));
    expect(requested).toEqual([searchUrl('https://jiji.ng', 'satin slip dress')]);
    expect(result!.outcome).toBe('live');
    expect(result!.listings).toHaveLength(8);
    const slip = result!.listings.find((l) => l.title.includes('Cowl Neck Slip Dress'))!;
    expect(slip).toMatchObject({
      department: 'clothing',
      category: 'dresses',
      categoryPath: ['Fashion', "Women's Fashion", "Women's Clothing"],
      priceKobo: 1_500_000,
    });
  });

  it('drops ads outside the categories we sweep (vehicles, property...)', async () => {
    const body = JSON.parse(SEARCH) as { adverts_list: { adverts: { category_slug: string }[] } };
    body.adverts_list.adverts[0]!.category_slug = 'cars';
    const [result] = await runLiveSearch(options({ client: http(JSON.stringify(body)).client }));
    expect(result!.listings).toHaveLength(7);
  });

  it('honours the per-store limit', async () => {
    const [result] = await runLiveSearch(options({ limit: 3 }));
    expect(result!.listings).toHaveLength(3);
  });
});

describe('runLiveSearch', () => {
  it('caches raw results 30 minutes per store and normalized query', async () => {
    const cache = memoryCache();
    const { client, requested } = http();
    await runLiveSearch(options({ client, cache }));
    const [again] = await runLiveSearch(options({ client, cache, query: '  satin   SLIP dress ' }));
    expect(requested).toHaveLength(1);
    expect(again).toMatchObject({ outcome: 'cache' });
    expect(again!.listings).toHaveLength(8);
    expect(cache.store.get(liveCacheKey(jiji.id, 'satin slip dress'))!.ttl).toBe(1800);
  });

  it('makes at most one call per store per search', async () => {
    const { client, requested } = http();
    await runLiveSearch(
      options({
        client,
        targets: [
          { store: jiji, adapter: jijiAdapter },
          { store: jiji, adapter: jijiAdapter },
        ],
      }),
    );
    expect(requested).toHaveLength(1);
  });

  it('skips stores without liveSearch, below tier 1, paused, or not robots-reviewed', async () => {
    const { client, requested } = http();
    const jumia = testStore({ id: '00000000-0000-4000-8000-0000000000b1', domain: 'www.jumia.com.ng' });
    const results = await runLiveSearch(
      options({
        client,
        targets: [
          { store: jumia, adapter: jumiaAdapter },
          { store: { ...jiji, id: '00000000-0000-4000-8000-0000000000a2', tier: 2 }, adapter: jijiAdapter },
          {
            store: { ...jiji, id: '00000000-0000-4000-8000-0000000000a3', status: 'paused' },
            adapter: jijiAdapter,
          },
          {
            store: {
              ...jiji,
              id: '00000000-0000-4000-8000-0000000000a4',
              crawlPolicy: { robotsOk: false, maxRps: 1 },
            },
            adapter: jijiAdapter,
          },
        ],
      }),
    );
    expect(results.map((r) => r.outcome)).toEqual(['skipped', 'skipped', 'skipped', 'skipped']);
    expect(requested).toEqual([]);
  });

  it('a block backs the store off for an hour, never retries, never throws', async () => {
    const cache = memoryCache();
    const fail = new Blocked('https://jiji.ng/api_web/v1/listing', 'status_403');
    const [first] = await runLiveSearch(options({ cache, client: http(SEARCH, { fail }).client }));
    expect(first).toMatchObject({ outcome: 'error', listings: [] });
    expect(cache.store.get(liveBackoffKey(jiji.id))!.ttl).toBe(3600);
    const { client, requested } = http();
    const [second] = await runLiveSearch(options({ cache, client }));
    expect(second!.outcome).toBe('backoff');
    expect(requested).toEqual([]);
  });

  it('gives up on a slow store within the time budget', async () => {
    const started = Date.now();
    const [result] = await runLiveSearch(
      options({ client: http(SEARCH, { delayMs: 5000 }).client, timeoutMs: 100 }),
    );
    expect(result!.outcome).toBe('error');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('ignores empty queries and never logs the query text', async () => {
    expect(await runLiveSearch(options({ query: ' ' }))).toEqual([]);
    const log = logger();
    await runLiveSearch(options({ log, query: 'Satin Slip Dress' }));
    expect(JSON.stringify(log.lines).toLowerCase()).not.toContain('satin');
    expect(normalizeQuery('  Satin\tSlip  ')).toBe('satin slip');
  });
});

describe('store type check', () => {
  it('test stores are tier 1 and active by default', () => {
    const s: StoreRef = jiji;
    expect([s.tier, s.status, s.crawlPolicy.robotsOk]).toEqual([1, 'active', true]);
  });
});
