/**
 * Live search hook (03 §3.6): asks tier-1 stores with a `liveSearch` adapter when indexed
 * results are weak. Rate limits are shared with the worker on redis-queue (one budget per
 * domain); results are cached on redis-cache (30 min). The search pipeline (phase 05)
 * decides when to call it and how to show "live" listings.
 */
import {
  AdapterRegistry,
  allAdapters,
  PoliteHttp,
  RedisDomainLimiter,
  RobotsCache,
  ROBOTS_AGENT,
  runLiveSearch,
  type AdapterLogger,
  type LiveCache,
  type LiveResult,
  type LiveTarget,
  type SourceAdapter,
} from '@cheapa/adapters';
import { StoreRef } from '@cheapa/core';
import { stores, type CatalogConnection } from '@cheapa/db/catalog';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { CATALOG_DB } from '../../infra/database.module.js';
import { REDIS_CACHE, REDIS_QUEUE } from '../../infra/redis.module.js';

/** Adapters to search with; defaults to allAdapters (tests inject fakes). */
export const LIVE_ADAPTERS = Symbol('LIVE_ADAPTERS');

/** The live-capable store list changes rarely; reload it at most this often. */
const STORES_TTL_MS = 5 * 60_000;

export interface LiveSearchRequest {
  query: string;
  /** Per-store budget; the whole search must stay fast (05 §5.3). */
  timeoutMs?: number;
  limit?: number;
}

@Injectable()
export class LiveSearchService {
  private readonly log = new Logger(LiveSearchService.name);
  /** Nest's Logger says `log` where adapters say `info`. */
  private readonly adapterLog: AdapterLogger = {
    debug: (obj, msg) => this.log.debug(obj, msg),
    info: (obj, msg) => this.log.log(obj, msg),
    warn: (obj, msg) => this.log.warn(obj, msg),
    error: (obj, msg) => this.log.error(obj, msg),
  };
  private readonly registry: AdapterRegistry;
  private readonly limiter: RedisDomainLimiter;
  private readonly robots = new RobotsCache(ROBOTS_AGENT);
  private readonly cache: LiveCache;
  private targets: { at: number; list: LiveTarget[] } | null = null;

  constructor(
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
    @Inject(REDIS_QUEUE) queue: Redis,
    @Inject(REDIS_CACHE) cache: Redis,
    @Optional() @Inject(LIVE_ADAPTERS) adapters?: readonly SourceAdapter[],
  ) {
    this.registry = new AdapterRegistry(adapters ?? allAdapters);
    this.limiter = new RedisDomainLimiter(queue);
    this.cache = {
      get: (key) => cache.get(key),
      set: async (key, value, ttl) => void (await cache.set(key, value, 'EX', ttl)),
    };
  }

  async search(request: LiveSearchRequest): Promise<LiveResult[]> {
    const log = this.adapterLog;
    try {
      return await runLiveSearch({
        query: request.query,
        targets: await this.liveTargets(),
        httpFor: (store) =>
          new PoliteHttp({
            limiter: this.limiter,
            robots: this.robots,
            maxRps: store.crawlPolicy.maxRps,
            log,
          }),
        cache: this.cache,
        log,
        ...(request.limit ? { limit: request.limit } : {}),
        timeoutMs: request.timeoutMs ?? 4000,
      });
    } catch (error) {
      // Redis or the catalog being down must not fail a search: live results are a bonus.
      this.log.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'live search unavailable');
      return [];
    }
  }

  /** Active, robots-reviewed tier-1 stores whose adapter implements liveSearch. */
  private async liveTargets(): Promise<LiveTarget[]> {
    if (this.targets && Date.now() - this.targets.at < STORES_TTL_MS) return this.targets.list;
    const rows = await this.catalog.db
      .select({
        id: stores.id,
        name: stores.name,
        domain: stores.domain,
        platform: stores.platform,
        tier: stores.tier,
        status: stores.status,
        crawlPolicy: stores.crawlPolicy,
      })
      .from(stores)
      .where(
        and(
          eq(stores.tier, 1),
          eq(stores.status, 'active'),
          sql`(${stores.crawlPolicy}->>'robotsOk')::boolean`,
        ),
      );
    const list: LiveTarget[] = [];
    for (const row of rows) {
      const store = StoreRef.parse(row);
      const adapter = this.registry.forStore(store);
      if (adapter?.liveSearch) list.push({ store, adapter });
    }
    this.targets = { at: Date.now(), list };
    return list;
  }
}
