/**
 * Match review queue (04 §4.4): the matcher's provisional merges (score 0.65–0.82) wait
 * here for an admin. Merge confirms; split moves the listing to a new product of its own.
 * Decisions are exported to scripts/data/pairs-labelled.jsonl to tune the thresholds.
 */
import { newProduct, type ReviewDecisionRequest, type ReviewItem } from '@cheapa/core';
import {
  canonicalProducts,
  listings,
  matchReviews,
  refreshCanonicalProduct,
  stores,
  type CatalogConnection,
} from '@cheapa/db/catalog';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, count, eq, isNull } from 'drizzle-orm';
import { CATALOG_DB } from '../../infra/database.module.js';

@Injectable()
export class ReviewsService {
  constructor(@Inject(CATALOG_DB) private readonly catalog: CatalogConnection) {}

  /** Oldest undecided reviews first, listing and candidate side by side. */
  async queue(limit: number): Promise<{ items: ReviewItem[]; pending: number }> {
    const { db } = this.catalog;
    const rows = await db
      .select({
        reviewId: matchReviews.id,
        score: matchReviews.score,
        createdAt: matchReviews.createdAt,
        listing: {
          listingId: listings.id,
          title: listings.title,
          brand: listings.brand,
          department: listings.department,
          category: listings.category,
          condition: listings.condition,
          variant: listings.variant,
          priceKobo: listings.priceKobo,
          imageUrl: listings.imageUrl,
          storeName: stores.name,
          sourceUrl: listings.sourceUrl,
        },
        candidate: {
          productId: canonicalProducts.id,
          slug: canonicalProducts.slug,
          title: canonicalProducts.title,
          brand: canonicalProducts.brand,
          department: canonicalProducts.department,
          category: canonicalProducts.category,
          variant: canonicalProducts.variant,
          repImageUrl: canonicalProducts.repImageUrl,
          listingCount: canonicalProducts.listingCount,
          minPriceKobo: canonicalProducts.minPriceKobo,
        },
      })
      .from(matchReviews)
      .innerJoin(listings, eq(listings.id, matchReviews.listingId))
      .innerJoin(stores, eq(stores.id, listings.storeId))
      .innerJoin(canonicalProducts, eq(canonicalProducts.id, matchReviews.candidateProductId))
      .where(isNull(matchReviews.decision))
      .orderBy(asc(matchReviews.createdAt))
      .limit(limit);
    const [pending] = await db.select({ n: count() }).from(matchReviews).where(isNull(matchReviews.decision));
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      pending: pending?.n ?? 0,
    };
  }

  /**
   * Applies a decision. `reviewer` is the admin's Clerk user id, the only user data the
   * catalog may hold (CLAUDE.md rule 2). Skip leaves the review pending.
   */
  async decide(
    reviewId: string,
    decision: ReviewDecisionRequest['decision'],
    reviewer: string,
  ): Promise<{ productId: string }> {
    return this.catalog.db.transaction(async (tx) => {
      const [review] = await tx
        .select()
        .from(matchReviews)
        .where(eq(matchReviews.id, reviewId))
        .for('update');
      if (!review) throw new NotFoundException('Review not found');
      if (review.decision) throw new ConflictException(`Already decided: ${review.decision}`);
      const [listing] = await tx.select().from(listings).where(eq(listings.id, review.listingId));
      if (!listing) throw new NotFoundException('Listing not found');
      let productId = listing.canonicalProductId ?? review.candidateProductId;
      if (decision === 'skip') return { productId };

      if (decision === 'split' && listing.canonicalProductId === review.candidateProductId) {
        // A different product: the listing founds its own and leaves the candidate.
        const product = newProduct({
          listingId: listing.id,
          title: listing.title,
          department: listing.department,
          category: listing.category,
          brand: listing.brand,
          model: listing.model,
          modelNumber: listing.modelNumber,
          gtin: listing.gtin,
          variant: listing.variant,
          imageUrl: listing.imageUrl,
        });
        const [created] = await tx
          .insert(canonicalProducts)
          .values(product)
          .returning({ id: canonicalProducts.id });
        productId = created!.id;
        await tx.update(listings).set({ canonicalProductId: productId }).where(eq(listings.id, listing.id));
        await refreshCanonicalProduct(tx, review.candidateProductId);
        await refreshCanonicalProduct(tx, productId);
      }
      await tx
        .update(matchReviews)
        .set({ decision, reviewer, decidedAt: new Date() })
        .where(eq(matchReviews.id, reviewId));
      return { productId };
    });
  }
}
