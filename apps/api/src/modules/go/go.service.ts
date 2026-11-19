/**
 * Resolves /go targets (08 §8.4): catalog listing + store affiliate config, cached on
 * redis-cache for 10 minutes; live-search listings (not in the catalog yet) resolve from
 * the link search saved under `go:live:<id>`. Never writes; the click is queued.
 */
import { isListingHidden } from '@cheapa/core';
import { listings, stores, type CatalogConnection, type StoreAffiliate } from '@cheapa/db/catalog';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, type SQL } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { CATALOG_DB } from '../../infra/database.module.js';
import { REDIS_CACHE } from '../../infra/redis.module.js';
import { safeHttpUrl } from './affiliate.js';

export interface GoTarget {
  listingId: string;
  productId: string | null;
  storeId: string;
  /** Null when the listing is hidden (gone 30+ days, store not trusted) or its URL isn't http(s). */
  listingUrl: string | null;
  storeHome: string | null;
  affiliate: StoreAffiliate | null;
}

const TARGET_TTL_S = 10 * 60;
/** Stores whose listings we still send people to. */
const LINKABLE = new Set(['active', 'paused']);

const LiveLink = z.object({
  listingId: z.uuid(),
  storeId: z.uuid(),
  externalId: z.string(),
  sourceUrl: z.string(),
});

@Injectable()
export class GoService {
  constructor(
    @Inject(CATALOG_DB) private readonly catalog: CatalogConnection,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
  ) {}

  async resolve(listingId: string): Promise<GoTarget | null> {
    const key = `go:target:v1:${listingId}`;
    const cached = await this.cache.get(key).catch(() => null);
    if (cached) return JSON.parse(cached) as GoTarget;
    const target = (await this.fromCatalog(eq(listings.id, listingId))) ?? (await this.fromLive(listingId));
    if (target) await this.cache.set(key, JSON.stringify(target), 'EX', TARGET_TTL_S).catch(() => undefined);
    return target;
  }

  private async fromCatalog(where: SQL | undefined, asId?: string): Promise<GoTarget | null> {
    const [row] = await this.catalog.db
      .select({
        id: listings.id,
        productId: listings.canonicalProductId,
        storeId: listings.storeId,
        sourceUrl: listings.sourceUrl,
        lastSeenAt: listings.lastSeenAt,
        domain: stores.domain,
        status: stores.status,
        affiliate: stores.affiliate,
      })
      .from(listings)
      .innerJoin(stores, eq(stores.id, listings.storeId))
      .where(where)
      .limit(1);
    if (!row) return null;
    const visible = LINKABLE.has(row.status) && !isListingHidden(row.lastSeenAt, new Date());
    return {
      listingId: asId ?? row.id,
      productId: row.productId,
      storeId: row.storeId,
      listingUrl: visible ? safeHttpUrl(row.sourceUrl) : null,
      storeHome: `https://${row.domain}/`,
      affiliate: row.affiliate,
    };
  }

  /** A live listing: the catalog copy if the worker ingested it since, else the saved link. */
  private async fromLive(listingId: string): Promise<GoTarget | null> {
    const raw = await this.cache.get(`go:live:${listingId}`).catch(() => null);
    const link = raw ? LiveLink.safeParse(JSON.parse(raw)) : null;
    if (!link?.success) return null;
    const { storeId, externalId, sourceUrl } = link.data;
    const ingested = await this.fromCatalog(
      and(eq(listings.storeId, storeId), eq(listings.externalId, externalId)),
      listingId,
    );
    if (ingested) return ingested;
    const [store] = await this.catalog.db
      .select({ domain: stores.domain, status: stores.status, affiliate: stores.affiliate })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    if (!store) return null;
    return {
      listingId,
      productId: null,
      storeId,
      listingUrl: LINKABLE.has(store.status) ? safeHttpUrl(sourceUrl) : null,
      storeHome: `https://${store.domain}/`,
      affiliate: store.affiliate,
    };
  }
}
