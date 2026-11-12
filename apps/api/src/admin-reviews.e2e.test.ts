/**
 * 04 §4.4 review queue API: admin-only; listing and candidate side by side; merge confirms,
 * split moves the listing to its own product and fixes both products' counts, skip waits.
 */
import { ReviewDecisionResponse, ReviewQueueResponse } from '@cheapa/core';
import {
  canonicalProducts,
  listings,
  matchReviews,
  refreshCanonicalProduct,
  stores,
} from '@cheapa/db/catalog';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Harness, startHarness } from './test/harness.js';

let h: Harness;
const ORIGIN = 'http://localhost:3000';
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h?.stop();
});

const auth = (claims: Record<string, unknown>) => ({
  authorization: `Bearer ${h.signer.sign({ azp: ORIGIN, ...claims })}`,
});
// Signed per request: the signer only exists once the harness has started.
const admin = () => auth({ sub: 'user_admin', role: 'admin' });
const get = (url: string, headers: Record<string, string> = admin()) =>
  h.app.inject({ method: 'GET', url, headers });
const post = (url: string, payload: unknown, headers: Record<string, string> = admin()) =>
  h.app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> });

let productId: string;
let reviewedListingId: string;
let reviewId: string;
beforeEach(async () => {
  const { db } = h.catalog;
  await db.execute(sql`truncate stores, canonical_products, listings, match_reviews cascade`);
  const [store] = await db
    .insert(stores)
    .values({ name: 'Jiji', domain: 'jiji.test', platform: 'custom', tier: 1, status: 'active' })
    .returning({ id: stores.id });
  const [product] = await db
    .insert(canonicalProducts)
    .values({
      slug: 'fenty-beauty-gloss-bomb-9ml-abc123',
      title: 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml',
      department: 'beauty',
      category: 'lips',
      brand: 'Fenty Beauty',
      variant: { netContent: { value: 9, unit: 'ml' }, packCount: 1 },
    })
    .returning({ id: canonicalProducts.id });
  productId = product!.id;
  const base = {
    storeId: store!.id,
    department: 'beauty' as const,
    category: 'lips',
    brand: 'Fenty Beauty',
    inStock: true,
  };
  const [, reviewed] = await db
    .insert(listings)
    .values([
      {
        ...base,
        externalId: 'B1',
        sourceUrl: 'https://jiji.test/b1',
        title: 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml',
        priceKobo: 2_400_000,
        canonicalProductId: productId,
      },
      {
        ...base,
        externalId: 'B2',
        sourceUrl: 'https://jiji.test/b2',
        title: 'Fenty Beauty Lip Oil Cherry 9ml',
        priceKobo: 1_900_000,
        canonicalProductId: productId,
        imageUrl: 'https://img.test/b2.jpg',
      },
    ])
    .returning({ id: listings.id });
  reviewedListingId = reviewed!.id;
  await refreshCanonicalProduct(db, productId);
  const [review] = await db
    .insert(matchReviews)
    .values({ listingId: reviewedListingId, candidateProductId: productId, score: 0.71 })
    .returning({ id: matchReviews.id });
  reviewId = review!.id;
});

const productRow = async (id: string) =>
  (await h.catalog.db.select().from(canonicalProducts).where(eq(canonicalProducts.id, id)))[0]!;

describe('access', () => {
  it('401 signed out, 403 for a signed-in non-admin', async () => {
    expect((await get('/admin/reviews', {})).statusCode).toBe(401);
    expect((await get('/admin/reviews', auth({ sub: 'user_shopper' }))).statusCode).toBe(403);
    expect(
      (await post(`/admin/reviews/${reviewId}`, { decision: 'merge' }, auth({ sub: 'user_shopper' })))
        .statusCode,
    ).toBe(403);
  });
});

describe('GET /admin/reviews', () => {
  it('shows the listing and its candidate product side by side', async () => {
    const res = await get('/admin/reviews');
    expect(res.statusCode).toBe(200);
    const body = ReviewQueueResponse.parse(res.json());
    expect(body.pending).toBe(1);
    expect(body.items).toMatchObject([
      {
        reviewId,
        score: expect.closeTo(0.71, 3) as unknown,
        listing: {
          listingId: reviewedListingId,
          title: 'Fenty Beauty Lip Oil Cherry 9ml',
          storeName: 'Jiji',
          sourceUrl: 'https://jiji.test/b2',
          priceKobo: 1_900_000,
          imageUrl: 'https://img.test/b2.jpg',
        },
        candidate: {
          productId,
          title: 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml',
          listingCount: 2,
        },
      },
    ]);
  });
});

describe('POST /admin/reviews/:id', () => {
  it('merge confirms the provisional merge and records the reviewer', async () => {
    const res = await post(`/admin/reviews/${reviewId}`, { decision: 'merge' });
    expect(ReviewDecisionResponse.parse(res.json())).toEqual({ reviewId, decision: 'merge', productId });
    const [review] = await h.catalog.db.select().from(matchReviews).where(eq(matchReviews.id, reviewId));
    expect(review).toMatchObject({ decision: 'merge', reviewer: 'user_admin' });
    expect(review!.decidedAt).toBeInstanceOf(Date);
    expect((await get('/admin/reviews')).json()).toMatchObject({ pending: 0, items: [] });
    expect((await post(`/admin/reviews/${reviewId}`, { decision: 'split' })).statusCode).toBe(409);
  });

  it('split gives the listing its own product and fixes both products', async () => {
    const res = await post(`/admin/reviews/${reviewId}`, { decision: 'split' });
    const { productId: newId } = ReviewDecisionResponse.parse(res.json());
    expect(newId).not.toBe(productId);
    const [moved] = await h.catalog.db.select().from(listings).where(eq(listings.id, reviewedListingId));
    expect(moved!.canonicalProductId).toBe(newId);
    expect(await productRow(productId)).toMatchObject({ listingCount: 1, minPriceKobo: 2_400_000 });
    expect(await productRow(newId)).toMatchObject({
      title: 'Fenty Beauty Lip Oil Cherry 9ml',
      brand: 'Fenty Beauty',
      category: 'lips',
      listingCount: 1,
      minPriceKobo: 1_900_000,
      repImageUrl: 'https://img.test/b2.jpg',
    });
  });

  it('skip leaves the review pending and changes nothing', async () => {
    const res = await post(`/admin/reviews/${reviewId}`, { decision: 'skip' });
    expect(res.json()).toEqual({ reviewId, decision: 'skip', productId });
    expect((await get('/admin/reviews')).json()).toMatchObject({ pending: 1 });
  });

  it('404s an unknown review and 400s a bad decision', async () => {
    expect(
      (await post('/admin/reviews/00000000-0000-4000-8000-000000000000', { decision: 'merge' })).statusCode,
    ).toBe(404);
    expect((await post(`/admin/reviews/${reviewId}`, { decision: 'maybe' })).statusCode).toBe(400);
  });
});
