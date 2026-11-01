import { and, asc, cosineDistance, eq, gte, sql } from 'drizzle-orm';
import type { CatalogDb } from './client.js';
import { listingEmbeddings, listings } from './schema.js';

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
