/**
 * Catalog reads for search (05 §5.3): nearest listings by image and title vectors,
 * full-text hits, and the products/listings that become result cards. Read-only.
 */
import {
  canonicalProducts,
  listingEmbeddings,
  listings,
  stores,
  type CatalogConnection,
} from '@cheapa/db/catalog';
import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Hit, ProductMeta } from './rank.js';

/** Search only listings seen this recently (05 §5.3, 13 §13.5). */
export const SEARCH_SEEN_DAYS = 7;
/** 13 §13.5: top 200 by image vector feed both exact matches and lookalikes. */
export const IMAGE_NEIGHBOURS = 200;
export const TEXT_NEIGHBOURS = 60;
/** Listings shown per product card; the rest are a tap away on the product page. */
export const LISTINGS_PER_PRODUCT = 20;

type Db = CatalogConnection['db'];
type VecColumn = typeof listingEmbeddings.imageVec | typeof listingEmbeddings.textVec;

const halfvec = (v: readonly number[]) => sql`${JSON.stringify(v)}::halfvec`;
const seenSince = () => gte(listings.lastSeenAt, sql`now() - make_interval(days => ${SEARCH_SEEN_DAYS})`);

/** Lower-case word tokens joined with OR, safe for to_tsquery. */
export function orTsQuery(query: string): string | null {
  const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].slice(0, 12);
  return tokens.length ? tokens.join(' | ') : null;
}

export interface ProductRow {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  model: string | null;
  department: ProductMeta['department'];
  category: string | null;
  variant: ProductMeta['variant'];
  repImageUrl: string | null;
  cheapestNewKobo: number | null;
  cheapestUsedKobo: number | null;
  listingCount: number;
}

export type ListingRow = Awaited<ReturnType<CatalogSearch['listingsFor']>>[number];

export class CatalogSearch {
  constructor(private readonly db: Db) {}

  async nearest(column: 'image' | 'text', vector: readonly number[], modelVersion: string, limit: number) {
    const col: VecColumn = column === 'image' ? listingEmbeddings.imageVec : listingEmbeddings.textVec;
    return this.db.transaction(async (tx) => {
      // Filtered HNSW scans come back short without iterative scans (pgvector >= 0.8).
      await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
      const rows = await tx
        .select({
          listingId: listings.id,
          productId: listings.canonicalProductId,
          distance: sql<number>`${col} <=> ${halfvec(vector)}`.mapWith(Number),
        })
        .from(listingEmbeddings)
        .innerJoin(listings, eq(listings.id, listingEmbeddings.listingId))
        .where(and(isNotNull(col), eq(listingEmbeddings.modelVersion, modelVersion), seenSince()))
        .orderBy(sql`${col} <=> ${halfvec(vector)}`)
        .limit(limit);
      return rows.map((r): Hit => ({ listingId: r.listingId, productId: r.productId, sim: 1 - r.distance }));
    });
  }

  async fullText(query: string, limit = TEXT_NEIGHBOURS): Promise<Hit[]> {
    const ts = orTsQuery(query);
    if (!ts) return [];
    const tsq = sql`to_tsquery('simple', ${ts})`;
    const rows = await this.db
      .select({ listingId: listings.id, productId: listings.canonicalProductId, title: listings.title })
      .from(listings)
      .where(and(sql`${listings.search} @@ ${tsq}`, seenSince()))
      .orderBy(desc(sql`ts_rank_cd(${listings.search}, ${tsq})`))
      .limit(limit);
    return rows;
  }

  async products(ids: readonly string[]): Promise<ProductRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select({
        id: canonicalProducts.id,
        slug: canonicalProducts.slug,
        title: canonicalProducts.title,
        brand: canonicalProducts.brand,
        model: canonicalProducts.model,
        department: canonicalProducts.department,
        category: canonicalProducts.category,
        variant: canonicalProducts.variant,
        repImageUrl: canonicalProducts.repImageUrl,
        cheapestNewKobo: canonicalProducts.cheapestNewKobo,
        cheapestUsedKobo: canonicalProducts.cheapestUsedKobo,
        listingCount: canonicalProducts.listingCount,
      })
      .from(canonicalProducts)
      .where(inArray(canonicalProducts.id, [...ids]));
  }

  /** Visible listings of these products, in stock first, cheapest first. */
  async listingsFor(productIds: readonly string[]) {
    if (productIds.length === 0) return [];
    return this.db
      .select({
        id: listings.id,
        productId: listings.canonicalProductId,
        storeName: stores.name,
        storeTier: stores.tier,
        priceKobo: listings.priceKobo,
        priceKind: listings.priceKind,
        priceMaxKobo: listings.priceMaxKobo,
        oldPriceKobo: listings.oldPriceKobo,
        condition: listings.condition,
        inStock: listings.inStock,
        variant: listings.variant,
        lastSeenAt: listings.lastSeenAt,
        suspectLow: listings.suspectLow,
        sponsored: listings.sponsored,
      })
      .from(listings)
      .innerJoin(stores, eq(stores.id, listings.storeId))
      .where(
        and(inArray(listings.canonicalProductId, [...productIds]), seenSince(), eq(stores.status, 'active')),
      )
      .orderBy(desc(listings.inStock), asc(listings.priceKobo));
  }

  async storeInfo(ids: readonly string[]): Promise<Map<string, { name: string; tier: number }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: stores.id, name: stores.name, tier: stores.tier })
      .from(stores)
      .where(inArray(stores.id, [...ids]));
    return new Map(rows.map((r) => [r.id, { name: r.name, tier: r.tier }]));
  }
}
