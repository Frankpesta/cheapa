/**
 * 04 §4.2–4.3 end to end: process -> match queue -> canonical products, against a real
 * catalog database. Image similarity doesn't exist yet (phase 05), so fashion only merges
 * on exact keys; beauty and electronics merge on text and attributes.
 */
import type { RawListingInput } from '@cheapa/core';
import { canonicalProducts, listings, matchReviews } from '@cheapa/db/catalog';
import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decidedPairs, toJsonl } from './crawl/pairs.js';
import { runMatch } from './jobs/match.js';
import { runProcess } from './jobs/process.js';
import type { MatchJob, ProcessJob } from './queues.js';
import { startHarness, type Harness } from './test/harness.js';

let h: Harness;
let jumia: string;
let jiji: string;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.catalog.db.execute(
    sql`truncate stores, listings, canonical_products, price_history, crawl_jobs cascade`,
  );
  await h.queues.match.obliterate({ force: true });
  jumia = await h.addStore({ name: 'Jumia', domain: 'jumia.test' });
  jiji = await h.addStore({ name: 'Jiji', domain: 'jiji.test' });
});

const listing = (
  externalId: string,
  title: string,
  priceKobo: number,
  extra: Partial<RawListingInput> = {},
) => ({
  externalId,
  sourceUrl: `https://shop.test/p/${externalId}`,
  title,
  priceKobo,
  inStock: true,
  ...extra,
});

let seq = 0;
async function crawl(storeId: string, items: RawListingInput[], fetchedAt = '2026-11-12T09:00:00.000Z') {
  const data: ProcessJob = { storeId, crawlJobId: crypto.randomUUID(), fetchedAt, listings: items };
  return runProcess(h.deps, { id: `p${++seq}`, data } as Job<ProcessJob>);
}

/** Runs every queued match job, like a concurrency-1 consumer. Call it after each crawl. */
async function drainMatches() {
  const jobs = (await h.queues.match.getJobs(['waiting'])) as Job<MatchJob>[];
  const results = [];
  for (const job of jobs) {
    results.push(await runMatch(h.deps, job));
    await job.remove();
  }
  return results;
}
const products = () => h.catalog.db.select().from(canonicalProducts).orderBy(canonicalProducts.createdAt);
const productOf = async (externalId: string) =>
  (
    await h.catalog.db
      .select({ p: listings.canonicalProductId })
      .from(listings)
      .where(eq(listings.externalId, externalId))
  )[0]!.p;

describe('match: electronics (brand + model + exact variant)', () => {
  it('the same phone from two stores becomes one product with a price range', async () => {
    await crawl(jumia, [listing('J1', 'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black', 15_500_000)]);
    expect((await drainMatches()).map((r) => r.decision)).toEqual(['new']);
    await crawl(jiji, [listing('X1', 'Samsung Galaxy A07 4GB/128GB Dual SIM Blue', 14_200_000)]);
    expect((await drainMatches()).map((r) => r.decision)).toEqual(['merge']);

    const [p] = await products();
    expect(await products()).toHaveLength(1);
    expect(p).toMatchObject({
      department: 'electronics',
      category: 'phones',
      brand: 'Samsung',
      model: 'Galaxy A07',
      variant: { storageGb: 128, ramGb: 4 },
      listingCount: 2,
      minPriceKobo: 14_200_000,
      maxPriceKobo: 15_500_000,
    });
    expect(p!.slug).toMatch(/^samsung-galaxy-a07-128gb-4gb-ram-[0-9a-f]{6}$/);
    expect(await productOf('X1')).toBe(p!.id);
  });

  it('another storage is another product', async () => {
    await crawl(jumia, [listing('J1', 'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black', 15_500_000)]);
    await drainMatches();
    await crawl(jiji, [listing('X2', 'Samsung Galaxy A07 6.7" 4GB RAM/64GB ROM - Black', 12_000_000)]);
    expect((await drainMatches()).map((r) => r.decision)).toEqual(['new']);
    expect(await products()).toHaveLength(2);
  });
});

describe('match: fashion waits for the photo', () => {
  it('two dresses with the same words stay separate products until image similarity exists', async () => {
    await crawl(jumia, [listing('D1', 'Ladies Satin Slip Midi Dress - Wine', 1_250_000)]);
    await drainMatches();
    await crawl(jiji, [listing('D2', 'Ladies Satin Slip Midi Dress - Wine', 990_000)]);
    expect((await drainMatches()).map((r) => r.decision)).toEqual(['new']);
    expect(await products()).toHaveLength(2);
  });

  it('but a shared GTIN is the same product', async () => {
    await crawl(jumia, [
      listing('S1', 'Nike Air Force 1 07 Triple White', 9_500_000, { gtin: '0195244658476' }),
    ]);
    await drainMatches();
    await crawl(jiji, [
      listing('S2', 'Original AF1 Low White Sneakers', 8_000_000, { gtin: '0195244658476' }),
    ]);
    expect((await drainMatches()).map((r) => r.decision)).toEqual(['merge']);
    expect(await productOf('S1')).toBe(await productOf('S2'));
  });
});

describe('match: beauty review band', () => {
  it('a moderately similar product merges provisionally and is queued for review', async () => {
    await crawl(jumia, [listing('B1', 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml', 2_400_000)]);
    await drainMatches();
    await crawl(jiji, [listing('B2', 'Fenty Beauty Lip Oil Cherry 9ml', 1_900_000)]);
    const [result] = await drainMatches();
    expect(result).toMatchObject({ decision: 'review' });
    expect(result!.score).toBeGreaterThanOrEqual(0.65);
    expect(result!.score).toBeLessThan(0.82);
    const reviews = await h.catalog.db.select().from(matchReviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ candidateProductId: await productOf('B1'), decision: null });
  });
});

describe('match: products stay current', () => {
  it('a price change refreshes the product’s range, and matched listings are not re-queued', async () => {
    await crawl(jumia, [listing('J1', 'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black', 15_500_000)]);
    await drainMatches();
    await crawl(
      jumia,
      [listing('J1', 'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black', 13_900_000)],
      '2026-11-13T09:00:00.000Z',
    );
    expect(await h.queues.match.count()).toBe(0);
    const [p] = await products();
    expect(p).toMatchObject({ minPriceKobo: 13_900_000, maxPriceKobo: 13_900_000, listingCount: 1 });
  });

  it('a second match job for the same listing is a no-op', async () => {
    await crawl(jumia, [listing('J1', 'Samsung Galaxy A07 6.7" 4GB RAM/128GB ROM - Black', 15_500_000)]);
    const [job] = (await h.queues.match.getJobs(['waiting'])) as Job<MatchJob>[];
    await runMatch(h.deps, job!);
    expect(await runMatch(h.deps, job!)).toEqual({ skipped: 'already_matched' });
  });
});

describe('labelled pairs export (04 §4.4)', () => {
  it('turns decided reviews into same/different pairs, store facts only', async () => {
    await crawl(jumia, [listing('B1', 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml', 2_400_000)]);
    await drainMatches();
    await crawl(jiji, [listing('B2', 'Fenty Beauty Lip Oil Cherry 9ml', 1_900_000)]);
    await drainMatches();
    expect(await decidedPairs(h.catalog.db)).toEqual([]);

    await h.catalog.db
      .update(matchReviews)
      .set({ decision: 'split', reviewer: 'user_admin', decidedAt: new Date('2026-11-13T10:00:00Z') });
    const pairs = await decidedPairs(h.catalog.db);
    expect(pairs).toMatchObject([
      {
        label: 'different',
        decidedAt: '2026-11-13T10:00:00.000Z',
        listing: { title: 'Fenty Beauty Lip Oil Cherry 9ml', store: 'Jiji', brand: 'Fenty Beauty' },
        product: { title: 'Fenty Beauty Gloss Bomb Universal Lip Luminizer 9ml', category: 'lips' },
      },
    ]);
    const line = toJsonl(pairs);
    expect(line.endsWith('\n')).toBe(true);
    expect(line).not.toContain('user_admin');
  });
});
