/**
 * 02-crawler-core.md 2.4 acceptance: re-running the same fixture twice writes zero new
 * history rows; changing one price writes exactly one.
 */
import { PRICE_EVENTS_STREAM, PriceChangedEvent, type RawListingInput } from '@cheapa/core';
import { crawlJobs, listings, priceHistory } from '@cheapa/db/catalog';
import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { markStoreStale, runProcess } from './jobs/process.js';
import type { ProcessJob } from './queues.js';
import { startHarness, type Harness } from './test/harness.js';

interface Fixture {
  fetchedAt: string;
  listings: RawListingInput[];
}
const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/process-women-fashion.json', import.meta.url), 'utf8'),
) as Fixture;

let h: Harness;
let storeId: string;
let crawlJobId: string;
let stream: string;
beforeAll(async () => {
  h = await startHarness();
  stream = `${h.prefix}:${PRICE_EVENTS_STREAM}`;
});
afterAll(() => h.stop());

beforeEach(async () => {
  await h.catalog.db.execute(sql`truncate stores, listings, price_history, crawl_jobs cascade`);
  await h.redis.del(stream);
  await h.queues.embed.obliterate({ force: true });
  storeId = await h.addStore({ name: 'Fake Fashion' });
  const [cj] = await h.catalog.db
    .insert(crawlJobs)
    .values({ storeId, adapter: 'fake', kind: 'discover', status: 'running' })
    .returning({ id: crawlJobs.id });
  crawlJobId = cj!.id;
});

let seq = 0;
function process(items: RawListingInput[] = fixture.listings, fetchedAt = fixture.fetchedAt) {
  const data: ProcessJob = { storeId, crawlJobId, fetchedAt, listings: items };
  return runProcess(h.deps, { id: `p${++seq}`, data } as Job<ProcessJob>);
}
const historyCount = () => h.catalog.db.$count(priceHistory);
async function events(): Promise<PriceChangedEvent[]> {
  const entries = await h.redis.xrange(stream, '-', '+');
  return entries.map(([, fields]) => PriceChangedEvent.parse(JSON.parse(fields[3]!)));
}
const later = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3600_000).toISOString();
const withPrice = (externalId: string, priceKobo: number) =>
  fixture.listings.map((l) => (l.externalId === externalId ? { ...l, priceKobo } : l));

describe('process: upsert and change detection', () => {
  it('stores normalized listings and drops used beauty', async () => {
    expect(await process()).toEqual({
      inserted: 5,
      updated: 0,
      changed: 5,
      outdated: 0,
      dropped: { used_beauty: 1 },
    });
    const rows = await h.catalog.db.select().from(listings).orderBy(listings.externalId);
    expect(rows.map((r) => [r.externalId, r.department, r.category])).toEqual([
      ['BT-5005', 'beauty', 'lips'],
      ['DR-1001', 'clothing', 'dresses'],
      ['ER-4004', 'bags_accessories', 'earrings'],
      ['HL-2002', 'shoes', 'heels'],
      ['WG-3003', 'hair', 'wigs'],
    ]);
    const dress = rows.find((r) => r.externalId === 'DR-1001')!;
    expect(dress).toMatchObject({
      title: 'Ladies Satin Bodycon Midi Dress - Wine | Sizes S-XL',
      brand: null,
      priceKind: 'from',
      oldPriceKobo: 1_800_000,
      variant: { audience: 'women', colours: ['Wine'], material: 'Satin' },
      attributes: { rawTitle: fixture.listings[0]!.title },
    });
    expect(dress.lastSeenAt.toISOString()).toBe(fixture.fetchedAt);
    expect(rows.find((r) => r.externalId === 'ER-4004')!.variant).toMatchObject({ packCount: 2 });
  });

  it('re-running the same fixture writes zero new history rows and no events', async () => {
    await process();
    expect(await historyCount()).toBe(5);
    expect(await events()).toHaveLength(5);

    const again = await process(fixture.listings, later(fixture.fetchedAt, 24));
    expect(again).toMatchObject({ inserted: 0, updated: 5, changed: 0 });
    expect(await historyCount()).toBe(5);
    expect(await events()).toHaveLength(5);
    const [dress] = await h.catalog.db.select().from(listings).where(eq(listings.externalId, 'DR-1001'));
    expect(dress!.lastSeenAt.toISOString()).toBe(later(fixture.fetchedAt, 24));
  });

  it('changing one price writes exactly one history row and one event', async () => {
    await process();
    await process(withPrice('DR-1001', 990_000), later(fixture.fetchedAt, 24));

    expect(await historyCount()).toBe(6);
    const last = (await events()).at(-1)!;
    expect(last).toMatchObject({
      type: 'price.changed',
      storeName: 'Fake Fashion',
      oldPriceKobo: 1_250_000,
      newPriceKobo: 990_000,
      wasInStock: true,
      inStock: true,
      productId: null,
      observedAt: later(fixture.fetchedAt, 24),
    });
    const [cj] = await h.catalog.db.select().from(crawlJobs).where(eq(crawlJobs.id, crawlJobId));
    expect(cj!.itemsChanged).toBe(6);
  });

  it('a stock change alone is a change', async () => {
    await process();
    const restocked = fixture.listings.map((l) => (l.externalId === 'ER-4004' ? { ...l, inStock: true } : l));
    await process(restocked, later(fixture.fetchedAt, 1));
    expect(await historyCount()).toBe(6);
    expect((await events()).at(-1)).toMatchObject({ wasInStock: false, inStock: true });
  });

  it('a late retry with older data changes nothing', async () => {
    await process(fixture.listings, later(fixture.fetchedAt, 24));
    const result = await process(withPrice('DR-1001', 1), fixture.fetchedAt);
    expect(result).toMatchObject({ updated: 0, outdated: 5, changed: 0 });
    const [dress] = await h.catalog.db.select().from(listings).where(eq(listings.externalId, 'DR-1001'));
    expect(dress!.priceKobo).toBe(1_250_000);
  });

  it('queues an embed for new listings and changed images only', async () => {
    await process();
    // BT-5005 has no image.
    expect((await h.queues.embed.getJobs(['waiting'])).length).toBe(4);
    const newImage = fixture.listings.map((l) =>
      l.externalId === 'HL-2002' ? { ...l, imageUrl: 'https://img.example.ng/hl-2002-v2.jpg' } : l,
    );
    await process(newImage, later(fixture.fetchedAt, 24));
    const jobs = await h.queues.embed.getJobs(['waiting']);
    expect(jobs).toHaveLength(5);
    expect(jobs.map((j) => (j.data as { imageUrl: string }).imageUrl)).toContain(
      'https://img.example.ng/hl-2002-v2.jpg',
    );
  });

  it('a payload repeating an externalId keeps the last copy', async () => {
    const dress = fixture.listings[0]!;
    await process([dress, { ...dress, priceKobo: 1_100_000 }]);
    const [row] = await h.catalog.db.select().from(listings);
    expect(row!.priceKobo).toBe(1_100_000);
    expect(await historyCount()).toBe(1);
  });
});

describe('process: unseen listings', () => {
  it('marks listings unseen for 7 days out of stock, with history and events', async () => {
    const now = new Date('2026-11-20T09:00:00Z');
    h.deps.now = () => now;
    await process(fixture.listings.slice(0, 2), '2026-11-12T09:00:00.000Z'); // 8 days ago
    await process(fixture.listings.slice(2, 3), '2026-11-17T09:00:00.000Z'); // 3 days ago

    expect(await markStoreStale(h.deps, { id: storeId, name: 'Fake Fashion' })).toBe(2);
    const rows = await h.catalog.db
      .select({ externalId: listings.externalId, inStock: listings.inStock })
      .from(listings)
      .orderBy(listings.externalId);
    expect(rows).toEqual([
      { externalId: 'DR-1001', inStock: false },
      { externalId: 'HL-2002', inStock: false },
      { externalId: 'WG-3003', inStock: true },
    ]);
    expect(await historyCount()).toBe(5);
    expect((await events()).slice(-2)).toMatchObject([
      { wasInStock: true, inStock: false },
      { wasInStock: true, inStock: false },
    ]);
    // Idempotent: nothing left to mark.
    expect(await markStoreStale(h.deps, { id: storeId, name: 'Fake Fashion' })).toBe(0);
    delete h.deps.now;
  });
});
