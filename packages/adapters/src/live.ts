/**
 * Query-time live search (03 §3.6, 05 §5.3 step 4): when indexed results are weak, ask the
 * tier-1 stores that support it. At most one call per store per search, results cached
 * 30 minutes per query, a hard time budget, and a store that blocks us is left alone.
 * Never throws: a slow or failing store just contributes nothing.
 */
import { normalizeListing, skipReason, type NormalizedListing, type RawListing } from '@cheapa/core';
import { createHash } from 'node:crypto';
import { Blocked, RobotsDisallowed } from './errors.js';
import type { AdapterLogger, PoliteHttpClient, SourceAdapter, StoreRef } from './types.js';
import { validateListings } from './validate.js';

/** Results per query per store, cached (30 min, 03 §3.6). */
export const LIVE_CACHE_TTL_SECONDS = 30 * 60;
/** A store that blocked us or changed robots.txt is skipped for this long. */
export const LIVE_BACKOFF_SECONDS = 60 * 60;

/** redis-cache in the API: safe to lose. */
export interface LiveCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface LiveTarget {
  store: StoreRef;
  adapter: SourceAdapter;
}

export interface LiveSearchOptions {
  query: string;
  targets: readonly LiveTarget[];
  /** A PoliteHttp bound to the store's crawl policy (shared rate limit and robots cache). */
  httpFor(store: StoreRef): PoliteHttpClient;
  cache: LiveCache;
  log: AdapterLogger;
  /** Max listings per store. */
  limit?: number;
  /** Whole-call budget per store; search latency matters more than completeness. */
  timeoutMs?: number;
}

export type LiveOutcome = 'cache' | 'live' | 'skipped' | 'backoff' | 'error';

export interface LiveResult {
  storeId: string;
  outcome: LiveOutcome;
  /** Normalized, used beauty and other skip reasons already removed. */
  listings: NormalizedListing[];
}

/** Lower-case, single-spaced: "Satin  Slip Dress" and "satin slip dress" share a cache entry. */
export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 20);
export const liveCacheKey = (storeId: string, query: string) =>
  `live:${storeId}:${hash(normalizeQuery(query))}`;
export const liveBackoffKey = (storeId: string) => `live:backoff:${storeId}`;

function eligible({ store, adapter }: LiveTarget): boolean {
  return (
    typeof adapter.liveSearch === 'function' &&
    store.tier === 1 &&
    store.status === 'active' &&
    store.crawlPolicy.robotsOk
  );
}

function normalizeAll(rows: readonly RawListing[]): NormalizedListing[] {
  return rows.map(normalizeListing).filter((l) => skipReason(l) === null);
}

async function searchOne(target: LiveTarget, query: string, o: LiveSearchOptions): Promise<LiveResult> {
  const { store, adapter } = target;
  const empty = (outcome: LiveOutcome): LiveResult => ({ storeId: store.id, outcome, listings: [] });
  if (!eligible(target)) return empty('skipped');
  if (await o.cache.get(liveBackoffKey(store.id))) return empty('backoff');

  const key = liveCacheKey(store.id, query);
  const cached = await o.cache.get(key);
  if (cached !== null) {
    // Raw listings are cached, so a normalizer change applies to cached results too.
    const { listings } = validateListings(JSON.parse(cached) as unknown[]);
    return { storeId: store.id, outcome: 'cache', listings: normalizeAll(listings) };
  }

  const started = Date.now();
  try {
    const signal = AbortSignal.timeout(o.timeoutMs ?? 4000);
    const ctx = { http: o.httpFor(store), log: o.log, signal };
    const rows = await adapter.liveSearch!(ctx, store, normalizeQuery(query), o.limit ?? 20);
    const { listings, rejected } = validateListings(rows);
    await o.cache.set(key, JSON.stringify(listings), LIVE_CACHE_TTL_SECONDS);
    // Counts and timing only: the query is user input and never logged.
    o.log.info(
      { storeId: store.id, listings: listings.length, rejected: rejected.length, ms: Date.now() - started },
      'live search',
    );
    return { storeId: store.id, outcome: 'live', listings: normalizeAll(listings) };
  } catch (err) {
    if (err instanceof Blocked || err instanceof RobotsDisallowed) {
      // Rule 3: back off. The nightly crawl marks the store blocked and alerts.
      await o.cache.set(liveBackoffKey(store.id), err.name, LIVE_BACKOFF_SECONDS);
    }
    o.log.warn(
      { storeId: store.id, ms: Date.now() - started, err: err instanceof Error ? err.name : 'unknown' },
      'live search failed',
    );
    return empty('error');
  }
}

/** One call per store (duplicates dropped), all stores in parallel. */
export async function runLiveSearch(o: LiveSearchOptions): Promise<LiveResult[]> {
  if (normalizeQuery(o.query).length < 2) return [];
  const unique = [...new Map(o.targets.map((t) => [t.store.id, t])).values()];
  return Promise.all(unique.map((t) => searchOne(t, o.query, o)));
}
