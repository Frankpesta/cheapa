/**
 * Canonical products in the catalog (04 §4.2–4.3): load a listing for matching, retrieve
 * candidates, apply the matcher's decision, keep product aggregates current. SQL only;
 * the decision logic is @cheapa/core `decideMatch`.
 */
import { newProduct, type Candidate, type MatchDecision, type MatchItem } from '@cheapa/core';
import { canonicalProducts, listings, matchReviews, type CatalogDb } from '@cheapa/db/catalog';
import { and, eq, isNull, or, sql } from 'drizzle-orm';

type Tx = Parameters<Parameters<CatalogDb['transaction']>[0]>[0];
/** A connection or a transaction. */
export type Db = CatalogDb | Tx;

export interface MatchListing extends MatchItem {
  id: string;
  canonicalProductId: string | null;
  imageUrl: string | null;
}

/** Candidates per strategy (04 §4.3 says top 20 by vector; titles stand in until phase 05). */
const CANDIDATES = 20;

export async function loadMatchListing(db: Db, id: string): Promise<MatchListing | null> {
  const [row] = await db
    .select({
      id: listings.id,
      canonicalProductId: listings.canonicalProductId,
      department: listings.department,
      category: listings.category,
      title: listings.title,
      brand: listings.brand,
      model: listings.model,
      modelNumber: listings.modelNumber,
      gtin: listings.gtin,
      variant: listings.variant,
      phash: listings.phash,
      imageUrl: listings.imageUrl,
    })
    .from(listings)
    .where(eq(listings.id, id));
  return row ?? null;
}

const productColumns = {
  productId: canonicalProducts.id,
  department: canonicalProducts.department,
  category: canonicalProducts.category,
  title: canonicalProducts.title,
  brand: canonicalProducts.brand,
  model: canonicalProducts.model,
  modelNumber: canonicalProducts.modelNumber,
  gtin: canonicalProducts.gtin,
  variant: canonicalProducts.variant,
};

/**
 * Exact-key products (GTIN, brand + model number, brand + model) plus the closest titles in
 * the same department and category. Vetoes and scoring happen in core.
 */
export async function findCandidates(db: Db, l: MatchListing): Promise<Candidate[]> {
  const exact = or(
    l.gtin ? eq(canonicalProducts.gtin, l.gtin) : undefined,
    l.brand && l.modelNumber
      ? and(
          sql`lower(${canonicalProducts.brand}) = lower(${l.brand})`,
          sql`lower(${canonicalProducts.modelNumber}) = lower(${l.modelNumber})`,
        )
      : undefined,
    l.brand && l.model
      ? and(
          sql`lower(${canonicalProducts.brand}) = lower(${l.brand})`,
          sql`lower(${canonicalProducts.model}) = lower(${l.model})`,
        )
      : undefined,
  );
  const byKey = exact
    ? await db.select(productColumns).from(canonicalProducts).where(exact).limit(CANDIDATES)
    : [];
  const similar = await db
    .select(productColumns)
    .from(canonicalProducts)
    .where(
      and(
        eq(canonicalProducts.department, l.department),
        l.category ? eq(canonicalProducts.category, l.category) : isNull(canonicalProducts.category),
      ),
    )
    .orderBy(sql`similarity(${canonicalProducts.title}, ${l.title}) desc`)
    .limit(CANDIDATES);
  const seen = new Set<string>();
  return [...byKey, ...similar].filter((c) => !seen.has(c.productId) && seen.add(c.productId));
}

/**
 * Concurrent matches in one department+category could both create "the same new product";
 * a transaction-scoped advisory lock serialises them (other categories run in parallel).
 */
export async function lockCategory(tx: Tx, l: Pick<MatchListing, 'department' | 'category'>): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`match:${l.department}:${l.category ?? ''}`}))`,
  );
}

/** Writes the decision; returns the product the listing now belongs to. */
export async function applyDecision(tx: Tx, l: MatchListing, decision: MatchDecision): Promise<string> {
  let productId: string;
  if (decision.kind === 'new') {
    const product = newProduct({ ...l, listingId: l.id, variant: l.variant });
    const [row] = await tx.insert(canonicalProducts).values(product).returning({ id: canonicalProducts.id });
    productId = row!.id;
  } else {
    productId = decision.productId;
    if (decision.kind === 'review') {
      await tx
        .insert(matchReviews)
        .values({ listingId: l.id, candidateProductId: productId, score: decision.score });
    }
  }
  await tx.update(listings).set({ canonicalProductId: productId }).where(eq(listings.id, l.id));
  return productId;
}

/**
 * Denormalised price range and listing count (04 §4.2), over in-stock listings; the image
 * comes from the first listing that has one. An emptied product keeps its row.
 */
export async function refreshProduct(db: Db, productId: string): Promise<void> {
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
