/**
 * Labelled pairs from review decisions (04 §4.4): every decided match_reviews row becomes
 * one line of scripts/data/pairs-labelled.jsonl, the set the matcher thresholds are tuned
 * on. Store facts only: titles, attributes, image URLs. No reviewer ids leave the catalog.
 */
import type { Variant } from '@cheapa/core';
import { canonicalProducts, listings, matchReviews, stores, type CatalogDb } from '@cheapa/db/catalog';
import { asc, eq, isNotNull } from 'drizzle-orm';

export interface LabelledPair {
  reviewId: string;
  /** merge = same product, split = different products. */
  label: 'same' | 'different';
  score: number;
  decidedAt: string;
  listing: {
    title: string;
    brand: string | null;
    department: string;
    category: string | null;
    variant: Variant;
    imageUrl: string | null;
    store: string;
  };
  product: {
    title: string;
    brand: string | null;
    department: string;
    category: string | null;
    variant: Variant;
    imageUrl: string | null;
  };
}

export async function decidedPairs(db: CatalogDb): Promise<LabelledPair[]> {
  const rows = await db
    .select({
      reviewId: matchReviews.id,
      decision: matchReviews.decision,
      score: matchReviews.score,
      decidedAt: matchReviews.decidedAt,
      listing: {
        title: listings.title,
        brand: listings.brand,
        department: listings.department,
        category: listings.category,
        variant: listings.variant,
        imageUrl: listings.imageUrl,
        store: stores.name,
      },
      product: {
        title: canonicalProducts.title,
        brand: canonicalProducts.brand,
        department: canonicalProducts.department,
        category: canonicalProducts.category,
        variant: canonicalProducts.variant,
        imageUrl: canonicalProducts.repImageUrl,
      },
    })
    .from(matchReviews)
    .innerJoin(listings, eq(listings.id, matchReviews.listingId))
    .innerJoin(stores, eq(stores.id, listings.storeId))
    .innerJoin(canonicalProducts, eq(canonicalProducts.id, matchReviews.candidateProductId))
    .where(isNotNull(matchReviews.decision))
    .orderBy(asc(matchReviews.decidedAt), asc(matchReviews.id));
  return rows.map(({ decision, decidedAt, ...r }) => ({
    ...r,
    label: decision === 'merge' ? 'same' : 'different',
    decidedAt: (decidedAt ?? new Date(0)).toISOString(),
  }));
}

/** One JSON object per line, stable order: re-running the export only appends new decisions. */
export function toJsonl(pairs: readonly LabelledPair[]): string {
  return pairs.map((p) => JSON.stringify(p)).join('\n') + (pairs.length > 0 ? '\n' : '');
}
