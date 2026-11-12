/**
 * 04 §4.5 on a real catalog: "check seller" outliers within a condition group, and
 * cheapest new vs cheapest used kept apart.
 */
import { canonicalProducts, listings, refreshCanonicalProduct } from '@cheapa/db/catalog';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './test/harness.js';

let h: Harness;
let storeId: string;
let productId: string;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.catalog.db.execute(sql`truncate stores, listings, canonical_products cascade`);
  storeId = await h.addStore();
  const [p] = await h.catalog.db
    .insert(canonicalProducts)
    .values({
      slug: 'satin-slip-dress-abc123',
      title: 'Satin Slip Dress',
      department: 'clothing',
      category: 'dresses',
    })
    .returning({ id: canonicalProducts.id });
  productId = p!.id;
});

type Condition = 'new' | 'used' | 'uk_used' | 'unknown';
async function add(rows: [string, number, Condition, boolean?][]) {
  await h.catalog.db.insert(listings).values(
    rows.map(([externalId, naira, condition, inStock = true]) => ({
      storeId,
      externalId,
      sourceUrl: `https://shop.test/${externalId}`,
      title: 'Satin Slip Dress',
      priceKobo: naira * 100,
      condition,
      inStock,
      canonicalProductId: productId,
    })),
  );
  await refreshCanonicalProduct(h.catalog.db, productId);
}
const flagged = async () =>
  (
    await h.catalog.db
      .select({ id: listings.externalId, s: listings.suspectLow })
      .from(listings)
      .orderBy(listings.externalId)
  )
    .filter((r) => r.s)
    .map((r) => r.id);
const product = async () =>
  (await h.catalog.db.select().from(canonicalProducts).where(eq(canonicalProducts.id, productId)))[0]!;

describe('suspect low ("check seller")', () => {
  it('flags a price under half the median of its own condition group', async () => {
    await add([
      ['N1', 20_000, 'new'],
      ['N2', 21_000, 'unknown'],
      ['N3', 22_000, 'new'],
      ['N4', 8_000, 'new'], // median of new = 20,500: 8,000 is under half
      ['U1', 9_000, 'used'], // used items are judged against used, not new
      ['U2', 10_000, 'uk_used'],
      ['X1', 1_000, 'new', false], // out of stock: neither flagged nor counted
    ]);
    expect(await flagged()).toEqual(['N4']);
  });

  it('needs at least three prices in the group to call anything an outlier', async () => {
    await add([
      ['N1', 20_000, 'new'],
      ['N2', 5_000, 'new'],
    ]);
    expect(await flagged()).toEqual([]);
  });

  it('clears when the price is fixed', async () => {
    await add([
      ['N1', 20_000, 'new'],
      ['N2', 21_000, 'new'],
      ['N3', 22_000, 'new'],
      ['N4', 8_000, 'new'],
    ]);
    expect(await flagged()).toEqual(['N4']);
    await h.catalog.db.update(listings).set({ priceKobo: 1_900_000 }).where(eq(listings.externalId, 'N4'));
    await refreshCanonicalProduct(h.catalog.db, productId);
    expect(await flagged()).toEqual([]);
  });
});

describe('headline prices', () => {
  it('cheapest new and cheapest used never mix; unknown condition counts as new', async () => {
    await add([
      ['N1', 20_000, 'unknown'],
      ['N2', 18_000, 'new'],
      ['U1', 9_000, 'used'],
      ['U2', 12_000, 'uk_used'],
      ['X1', 1_000, 'used', false],
    ]);
    expect(await product()).toMatchObject({
      cheapestNewKobo: 1_800_000,
      cheapestUsedKobo: 900_000,
      minPriceKobo: 900_000,
      listingCount: 5,
    });
  });

  it('no used listings: no used price', async () => {
    await add([['N1', 20_000, 'new']]);
    expect(await product()).toMatchObject({ cheapestNewKobo: 2_000_000, cheapestUsedKobo: null });
  });
});
