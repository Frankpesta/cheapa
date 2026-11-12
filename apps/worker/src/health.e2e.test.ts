/** 02-crawler-core.md 2.5: run completion, health alerts and the crawl report, end to end. */
import { crawlJobs, listings } from '@cheapa/db/catalog';
import type { Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderTable, storeReport } from './crawl/report.js';
import { runPartitions } from './jobs/tick.js';
import { json, startHarness, waitFor, type Harness } from './test/harness.js';
import { startWorkers } from './workers.js';

let h: Harness;
let workers: Worker[] = [];
beforeEach(async () => {
  h = await startHarness({
    '/list': json({ pages: ['/page/1', '/page/2', '/page/1'] }),
    '/page/1': json({ products: [{ sku: 'D1', name: 'Satin Slip Dress - Wine', price: 1_250_000 }] }),
    '/page/2': json({ products: [{ sku: 'E1', name: 'Gold Hoop Earrings', price: 450_000 }] }),
  });
  workers = startWorkers(h.deps, h.redis, { discover: 1, fetch: 2, process: 1 }, h.prefix);
});
afterEach(async () => {
  await Promise.all(workers.map((w) => w.close()));
  await h.stop();
});

const runs = (storeId: string) =>
  h.catalog.db.select().from(crawlJobs).where(eq(crawlJobs.storeId, storeId)).orderBy(crawlJobs.createdAt);
const sweep = async (storeId: string, n: number) => {
  await h.queues.discover.add('discover', { storeId });
  await waitFor(async () => (await runs(storeId)).filter((r) => r.healthCheckedAt).length === n);
  // Alerts are sent after the claim, inside the job that won it: wait for the queues to go idle.
  await waitFor(async () => {
    const [d, f] = await Promise.all([
      h.queues.discover.count(),
      h.queues.fetch.getActiveCount().then(async (n) => n + (await h.queues.fetch.count())),
    ]);
    return d + f === 0 && (await h.queues.discover.getActiveCount()) === 0;
  });
};
const alerted = (n: number) => waitFor(() => Promise.resolve(h.alerts.length >= n));

describe('crawl run health', () => {
  it('completes a run once every distinct ref is fetched, and stays quiet when healthy', async () => {
    const storeId = await h.addStore();
    await sweep(storeId, 1);
    const [run] = await runs(storeId);
    expect(run).toMatchObject({ refsTotal: 2, fetchesDone: 2, fetchesFailed: 0, itemsFound: 2 });
    expect(h.alerts).toEqual([]);
  });

  it('runs the next sweep in full (fetch jobs are scoped to the run)', async () => {
    const storeId = await h.addStore();
    await sweep(storeId, 1);
    await sweep(storeId, 2);
    expect(h.server.count('/page/2')).toBe(2);
  });

  it('alerts on an error rate above 10%', async () => {
    h.server.route('/page/2', json({ redesigned: true }));
    const storeId = await h.addStore();
    await sweep(storeId, 1);
    await alerted(1);
    expect((await runs(storeId))[0]).toMatchObject({ fetchesDone: 1, fetchesFailed: 1 });
    expect(h.alerts).toMatchObject([{ kind: 'error_rate', storeId, details: { errorRate: 0.5 } }]);
  });

  it('alerts when items drop more than 40% below the 7-day median', async () => {
    const storeId = await h.addStore();
    const recent = new Date(Date.now() - 2 * 24 * 3600_000);
    await h.catalog.db.insert(crawlJobs).values(
      [10, 12].map((itemsFound) => ({
        storeId,
        adapter: 'fake',
        kind: 'discover' as const,
        status: 'succeeded' as const,
        itemsFound,
        healthCheckedAt: recent,
        createdAt: recent,
      })),
    );
    await sweep(storeId, 3);
    await alerted(1);
    expect(h.alerts).toMatchObject([
      { kind: 'items_dropped', storeId, details: { itemsFound: 2, median: 11 } },
    ]);
  });

  it('alerts when a tier-1 store has listings not seen for 48 h', async () => {
    const storeId = await h.addStore();
    await h.catalog.db.insert(listings).values({
      storeId,
      externalId: 'OLD1',
      sourceUrl: 'https://shop.example.ng/p/old1',
      title: 'Old Ankara Gown',
      priceKobo: 900_000,
      inStock: true,
      lastSeenAt: new Date(Date.now() - 3 * 24 * 3600_000),
    });
    await sweep(storeId, 1);
    expect(h.alerts).toMatchObject([{ kind: 'stale_listings', storeId }]);

    // process jobs run after fetch: wait for both crawled listings to land.
    await waitFor(async () => (await h.catalog.db.$count(listings)) === 3);
    const report = await storeReport(h.catalog.db);
    expect(report).toMatchObject([
      { store: 'Fake Fashion', tier: 1, items: 2, errors: '0/2 (0%)', fresh48h: '67% of 3' },
    ]);
    expect(renderTable(report)).toContain('Fake Fashion');
  });
});

describe('partition check', () => {
  it('alerts only when next month has no price_history partition', async () => {
    await runPartitions(h.deps);
    expect(h.alerts).toEqual([]);

    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const name = `price_history_y${next.getUTCFullYear()}m${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    await h.catalog.db.execute(sql.raw(`drop table ${name}`));
    // Simulate ensure failing to recreate it: check without ensuring.
    const { checkPartitions } = await import('./jobs/health.js');
    await checkPartitions(h.deps);
    expect(h.alerts).toMatchObject([{ kind: 'partition_missing' }]);
  });
});
