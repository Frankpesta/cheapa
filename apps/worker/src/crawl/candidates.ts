/**
 * Vector candidate retrieval for the matcher (04 §4.3, phase 05): the products whose
 * listings are nearest by image and by title embedding, then each candidate's best image
 * similarity and closest phash over all its listings. Title vectors only retrieve: MiniLM
 * cosines run high for any two titles in one category and have no labelled pairs to be
 * calibrated on yet, so scoring keeps the title-token similarity (DECISIONS.md).
 */
import { listingEmbeddings, listings } from '@cheapa/db/catalog';
import { and, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Db, MatchListing } from './products.js';

/** Products kept per strategy (04 §4.3: top 20 by text vector, top 20 by image vector). */
export const VECTOR_CANDIDATES = 20;
/** Listings scanned per strategy; several listings often share a product. */
const NEIGHBOURS = 60;

export interface ListingVectors {
  imageVec: number[] | null;
  textVec: number[] | null;
  modelVersion: string;
}

export interface ProductSignals {
  /** Best raw cosine between the listing's image and any of the product's listings. */
  imageSim?: number;
  /** The product's phash closest to the listing's (for the supplier-photo exact key). */
  phash?: bigint;
}

export async function loadListingVectors(db: Db, listingId: string): Promise<ListingVectors | null> {
  const [row] = await db
    .select({
      imageVec: listingEmbeddings.imageVec,
      textVec: listingEmbeddings.textVec,
      modelVersion: listingEmbeddings.modelVersion,
    })
    .from(listingEmbeddings)
    .where(eq(listingEmbeddings.listingId, listingId));
  return row ?? null;
}

const halfvec = (v: number[]) => sql`${JSON.stringify(v)}::halfvec`;

/** Already-matched listings in the same department and category, other than this one. */
function sameShelf(l: MatchListing): SQL | undefined {
  return and(
    isNotNull(listings.canonicalProductId),
    ne(listings.id, l.id),
    eq(listings.department, l.department),
    l.category ? eq(listings.category, l.category) : isNull(listings.category),
  );
}

/** Product ids nearest by one vector column, best first. */
async function nearestProducts(
  db: Db,
  l: MatchListing,
  column: typeof listingEmbeddings.imageVec | typeof listingEmbeddings.textVec,
  vector: number[],
  modelVersion: string,
): Promise<string[]> {
  // Filtered HNSW scans can come back short without iterative scans (pgvector >= 0.8).
  await db.execute(sql`set local hnsw.iterative_scan = relaxed_order`);
  const rows = await db
    .select({ productId: listings.canonicalProductId })
    .from(listingEmbeddings)
    .innerJoin(listings, eq(listings.id, listingEmbeddings.listingId))
    .where(and(sameShelf(l), eq(listingEmbeddings.modelVersion, modelVersion), isNotNull(column)))
    .orderBy(sql`${column} <=> ${halfvec(vector)}`)
    .limit(NEIGHBOURS);
  const ids: string[] = [];
  for (const { productId } of rows) {
    if (productId && !ids.includes(productId)) ids.push(productId);
    if (ids.length >= VECTOR_CANDIDATES) break;
  }
  return ids;
}

/** Candidate product ids from the listing's image and title vectors. */
export async function vectorCandidateIds(db: Db, l: MatchListing, v: ListingVectors): Promise<string[]> {
  const byImage = v.imageVec
    ? await nearestProducts(db, l, listingEmbeddings.imageVec, v.imageVec, v.modelVersion)
    : [];
  const byText = v.textVec
    ? await nearestProducts(db, l, listingEmbeddings.textVec, v.textVec, v.modelVersion)
    : [];
  return [...new Set([...byImage, ...byText])];
}

/**
 * Per candidate product: max image cosine over its listings (same model version only) and
 * its phash nearest the listing's. Missing signals stay undefined.
 */
export async function productSignals(
  db: Db,
  l: MatchListing,
  v: ListingVectors | null,
  productIds: readonly string[],
): Promise<Map<string, ProductSignals>> {
  const out = new Map<string, ProductSignals>();
  if (productIds.length === 0 || (!v?.imageVec && l.phash == null)) return out;
  const imageSim = v?.imageVec
    ? sql`max(1 - (${listingEmbeddings.imageVec} <=> ${halfvec(v.imageVec)}))`
    : sql`null::float8`;
  const phash =
    l.phash != null
      ? sql`(array_agg(${listings.phash} order by bit_count((${listings.phash} # ${l.phash.toString()}::bigint)::bit(64)))
          filter (where ${listings.phash} is not null))[1]`
      : sql`null::bigint`;
  const rows = await db
    .select({
      productId: listings.canonicalProductId,
      imageSim: sql<number | null>`${imageSim}`.mapWith(Number),
      phash: sql<string | null>`${phash}::text`,
    })
    .from(listings)
    .leftJoin(
      listingEmbeddings,
      and(
        eq(listingEmbeddings.listingId, listings.id),
        v ? eq(listingEmbeddings.modelVersion, v.modelVersion) : sql`false`,
      ),
    )
    .where(and(inArray(listings.canonicalProductId, [...productIds]), ne(listings.id, l.id)))
    .groupBy(listings.canonicalProductId);
  for (const r of rows) {
    if (!r.productId) continue;
    const s: ProductSignals = {};
    if (r.imageSim !== null && Number.isFinite(r.imageSim)) s.imageSim = r.imageSim;
    if (r.phash !== null) s.phash = BigInt(r.phash);
    out.set(r.productId, s);
  }
  return out;
}
