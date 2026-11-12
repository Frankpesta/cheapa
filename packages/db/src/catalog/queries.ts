import { and, asc, cosineDistance, eq, gte, sql } from 'drizzle-orm';
import type { CatalogDb } from './client.js';
import { canonicalProducts, listingEmbeddings, listings } from './schema.js';

export interface NearestListing {
  listingId: string;
  title: string;
  priceKobo: number;
  /** 1 - cosine distance: 1 = identical direction. */
  similarity: number;
}

/**
 * Nearest listings by image embedding (cosine), optionally limited to recently
 * seen listings. Uses the HNSW index; pgvector >= 0.8 iterative scans keep
 * filtered queries from returning short (05-visual-search.md 5.3).
 */
export async function nearestByImage(
  db: CatalogDb,
  vector: number[],
  options: { limit?: number; seenSince?: Date } = {},
): Promise<NearestListing[]> {
  const distance = cosineDistance(listingEmbeddings.imageVec, vector);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
    const rows = await tx
      .select({
        listingId: listings.id,
        title: listings.title,
        priceKobo: listings.priceKobo,
        distance: sql<number>`${distance}`.mapWith(Number),
      })
      .from(listingEmbeddings)
      .innerJoin(listings, eq(listings.id, listingEmbeddings.listingId))
      .where(and(options.seenSince ? gte(listings.lastSeenAt, options.seenSince) : undefined))
      .orderBy(asc(distance))
      .limit(options.limit ?? 60);
    return rows.map(({ distance: d, ...row }) => ({ ...row, similarity: 1 - d }));
  });
}

/** Conditions that count as "used" in headline prices and price-outlier checks. */
export const USED_CONDITIONS = ['used', 'uk_used', 'refurbished'] as const;
/** A price under this share of its condition group's median is "check seller" (04 §4.5). */
export const SUSPECT_LOW_RATIO = 0.5;
/** A median needs this many in-stock prices before it can call anything an outlier. */
export const SUSPECT_LOW_MIN_LISTINGS = 3;

/**
 * Recomputes a canonical product's denormalised fields (04 §4.2, §4.5) and its listings'
 * `suspect_low` flag. Over in-stock listings:
 * - min/max price and listing count; the image comes from the first listing with one;
 * - cheapest new and cheapest used, never mixed ("new" includes unknown condition: most
 *   fashion stores don't say; thrift, UK-used and refurbished are "used");
 * - suspect_low = under half the median of its own condition group, with at least three
 *   prices in that group.
 * An emptied product keeps its row. Runs on the connection or inside a transaction.
 */
export async function refreshCanonicalProduct(
  db: Pick<CatalogDb, 'execute'>,
  productId: string,
): Promise<void> {
  const used = sql.raw(USED_CONDITIONS.map((c) => `'${c}'`).join(', '));
  await db.execute(sql`
    with l as (
      select id, price_kobo, in_stock, condition in (${used}) as is_used
      from ${listings} where canonical_product_id = ${productId}
    ),
    med as (
      select is_used, percentile_cont(0.5) within group (order by price_kobo) as median, count(*) as n
      from l where in_stock group by is_used
    )
    update ${listings} x set suspect_low = coalesce(
      l.in_stock and m.n >= ${SUSPECT_LOW_MIN_LISTINGS} and l.price_kobo < ${SUSPECT_LOW_RATIO} * m.median, false)
    from l left join med m on m.is_used = l.is_used
    where x.id = l.id`);
  await db.execute(sql`
    update ${canonicalProducts} p set
      min_price_kobo = agg.min_price,
      max_price_kobo = agg.max_price,
      cheapest_new_kobo = agg.cheapest_new,
      cheapest_used_kobo = agg.cheapest_used,
      listing_count = agg.n,
      rep_image_url = coalesce(p.rep_image_url, agg.image),
      updated_at = now()
    from (
      select
        min(price_kobo) filter (where in_stock) as min_price,
        max(coalesce(price_max_kobo, price_kobo)) filter (where in_stock) as max_price,
        min(price_kobo) filter (where in_stock and condition not in (${used})) as cheapest_new,
        min(price_kobo) filter (where in_stock and condition in (${used})) as cheapest_used,
        count(*)::int as n,
        (array_agg(image_url order by first_seen_at) filter (where image_url is not null))[1] as image
      from ${listings} where canonical_product_id = ${productId}
    ) agg
    where p.id = ${productId}`);
}
