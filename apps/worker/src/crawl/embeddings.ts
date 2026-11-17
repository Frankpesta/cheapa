/** Catalog reads and writes for the `embed` consumer (05 §5.1). */
import { listingEmbeddings, listings, type CatalogDb } from '@cheapa/db/catalog';
import type { ListingVectors } from '@cheapa/ml';
import { eq, sql } from 'drizzle-orm';

export interface EmbedListing {
  id: string;
  storeId: string;
  title: string;
  imageUrl: string | null;
}

export async function loadEmbedListing(db: CatalogDb, id: string): Promise<EmbedListing | null> {
  const [row] = await db
    .select({
      id: listings.id,
      storeId: listings.storeId,
      title: listings.title,
      imageUrl: listings.imageUrl,
    })
    .from(listings)
    .where(eq(listings.id, id));
  return row ?? null;
}

/** One row per listing: replaced whenever the image changes or the models change. */
export async function saveEmbedding(
  db: CatalogDb,
  listingId: string,
  vectors: ListingVectors,
  modelVersion: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(listingEmbeddings)
      .values({ listingId, imageVec: vectors.imageVec, textVec: vectors.textVec, modelVersion })
      .onConflictDoUpdate({
        target: listingEmbeddings.listingId,
        set: {
          imageVec: vectors.imageVec,
          textVec: vectors.textVec,
          modelVersion,
          updatedAt: sql`now()`,
        },
      });
    await tx.update(listings).set({ phash: vectors.phash }).where(eq(listings.id, listingId));
  });
}
