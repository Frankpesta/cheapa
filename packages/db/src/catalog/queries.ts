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

/**
 * Denormalised price range and listing count (04 §4.2), over in-stock listings; the image
 * comes from the first listing that has one. An emptied product keeps its row. Runs on
 * the connection or inside a transaction (worker match job, API review decisions).
 */
export async function refreshCanonicalProduct(
  db: Pick<CatalogDb, 'execute'>,
  productId: string,
): Promise<void> {
  await db.execute(sql`
    update ${canonicalProducts} p set
      min_price_kobo = agg.min_price,
      max_price_kobo = agg.max_price,
      listing_count = agg.n,
      rep_image_url = coalesce(p.rep_image_url, agg.image),
      updated_at = now()
    from (
      select
        min(price_kobo) filter (where in_stock) as min_price,
        max(coalesce(price_max_kobo, price_kobo)) filter (where in_stock) as max_price,
        count(*)::int as n,
        (array_agg(image_url order by first_seen_at) filter (where image_url is not null))[1] as image
      from ${listings} where canonical_product_id = ${productId}
    ) agg
    where p.id = ${productId}`);
}
