import { send } from '@cheapa/adapters/testing';
import { crawlJobs, listings, priceHistory, stores } from '@cheapa/db/catalog';
import type { Job, Worker } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runFetch } from './jobs/fetch.js';
import { runPartitions, runTick } from './jobs/tick.js';
import type { FetchJob } from './queues.js';
import { json, startHarness, waitFor, type Harness } from './test/harness.js';
import { startWorkers, upsertSchedules } from './workers.js';

/** Lagos 02:00, inside the sweep window. */
const NIGHT = new Date('2026-11-02T01:00:00Z');

let h: Harness;
let workers: Worker[] = [];
beforeEach(async () => {
  h = await startHarness({
    '/list': json({ pages: ['/page/1', '/page/2'] }),
    '/page/1': json({
      products: [
        { sku: 'D1', name: 'Satin Slip Dress - Wine', price: 1_250_000 },
        { sku: 'W1', name: 'Bone Straight Wig 20"', price: 14_500_000 },
      ],
    }),
    '/page/2': json({ products: [{ sku: 'B1', name: 'Mini Shoulder Bag', price: 800_000 }] }),
  });
});
afterEach(async () => {
  await Promise.all(workers.map((w) => w.close()));
  workers = [];
  await h.stop();
});

const run = () => (workers = startWorkers(h.deps, h.redis, { discover: 1, fetch: 2, process: 1 }, h.prefix));
const crawlJob = async (storeId: string) =>
  (await h.catalog.db.select().from(crawlJobs).where(eq(crawlJobs.storeId, storeId)))[0];
const store = async (id: string) => (await h.catalog.db.select().from(stores).where(eq(stores.id, id)))[0]!;

describe('schedule tick', () => {
  it('enqueues due, crawlable stores once per day', async () => {
    const due = await h.addStore();
    await h.addStore({ domain: 'paused.ng', status: 'paused' });
    await h.addStore({ domain: 'norobots.ng', crawlPolicy: { robotsOk: false, maxRps: 1 } });
    await h.addStore({ domain: 'fresh.ng', lastCrawledAt: new Date(NIGHT.getTime() - 3600_000) });
    h.deps.now = () => NIGHT;

    expect(await runTick(h.deps)).toEqual({ enqueued: 1 });
    await runTick(h.deps); // a second tick the same night is deduplicated by job id
    const jobs = await h.queues.discover.getJobs(['waiting', 'delayed']);
    expect(jobs.map((j) => (j.data as { storeId: string }).storeId)).toEqual([due]);
    expect(jobs[0]!.id).toBe(`discover_${due}_2026-11-02`);
  });

  it('registers the tick and daily partition schedulers idempotently', async () => {
    await upsertSchedules(h.queues);
    await upsertSchedules(h.queues);
    const schedulers = await h.queues.schedule.getJobSchedulers();
    expect(schedulers.map((s) => s.key).sort()).toEqual(['partitions', 'tick']);
  });

  it('keeps price_history partitions ahead', async () => {
    await runPartitions(h.deps);
    const { rows } = await h.catalog.pool.query<{ n: number }>(
      `select count(*)::int as n from pg_inherits where inhrelid::regclass::text like 'price_history_%'`,
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(4);
  });
});

describe('discover -> fetch -> process', () => {
  it('crawls every page and stores normalized listings with their first price', async () => {
    const storeId = await h.addStore();
    run();
    await h.queues.discover.add('discover', { storeId });
    await waitFor(async () => (await crawlJob(storeId))?.itemsChanged === 3);

    const rows = await h.catalog.db
      .select({
        externalId: listings.externalId,
        department: listings.department,
        category: listings.category,
        variant: listings.variant,
      })
      .from(listings)
      .orderBy(listings.externalId);
    expect(rows).toMatchObject([
      { externalId: 'B1', department: 'bags_accessories', category: 'handbags' },
      { externalId: 'D1', department: 'clothing', category: 'dresses', variant: { colours: ['Wine'] } },
      { externalId: 'W1', department: 'hair', category: 'wigs', variant: { hair: { lengthInches: 20 } } },
    ]);
    expect(await h.catalog.db.$count(priceHistory)).toBe(3);
    expect(await crawlJob(storeId)).toMatchObject({
      adapter: 'fake',
      status: 'succeeded',
      itemsFound: 3,
      errors: [],
    });
    expect((await store(storeId)).lastCrawledAt).toBeInstanceOf(Date);
  });

  it('on 429: marks the store blocked, alerts, and never retries', async () => {
    h.server.route('/list', (res) => send(res, 429, 'Too Many Requests'));
    const storeId = await h.addStore();
    run();
    const job = await h.queues.discover.add('discover', { storeId });
    await waitFor(async () => (await job.getState()) === 'failed');

    expect(h.server.count('/list')).toBe(1);
    expect((await store(storeId)).status).toBe('blocked');
    expect(await crawlJob(storeId)).toMatchObject({ status: 'blocked' });
    expect(h.alerts).toMatchObject([{ kind: 'store_blocked', storeId }]);
    expect(await h.queues.fetch.count()).toBe(0);
  });

  it('records robots-disallowed refs and skips them without failing', async () => {
    h.server.route('/robots.txt', (res) => send(res, 200, 'User-agent: *\nDisallow: /page/2\n'));
    const storeId = await h.addStore();
    run();
    await h.queues.discover.add('discover', { storeId });
    await waitFor(async () => (await crawlJob(storeId))?.itemsFound === 2);
    await waitFor(async () => ((await crawlJob(storeId))?.errors.length ?? 0) === 1);

    expect((await crawlJob(storeId))!.errors).toMatchObject([{ kind: 'robots' }]);
    expect(h.server.count('/page/2')).toBe(0);
    expect(await h.queues.fetch.getJobCounts('failed')).toEqual({ failed: 0 });
    expect(h.alerts).toEqual([]);
  });
});

describe('fetch job', () => {
  const fetchJob = (data: FetchJob) => ({ id: 'f1', data }) as Job<FetchJob>;

  it('drops refs for a store blocked since discover ran', async () => {
    const storeId = await h.addStore({ status: 'blocked' });
    const result = await runFetch(
      h.deps,
      fetchJob({
        storeId,
        crawlJobId: '00000000-0000-4000-8000-000000000000',
        adapterId: 'fake',
        ref: { kind: 'page', url: `${h.server.origin}/page/1` },
      }),
    );
    expect(result).toEqual({ skipped: 'not_crawlable' });
    expect(h.server.count('/page/1')).toBe(0);
  });

  it('fails a page that no longer parses without retrying', async () => {
    h.server.route('/page/1', json({ redesigned: true }));
    const storeId = await h.addStore();
    const [cj] = await h.catalog.db
      .insert(crawlJobs)
      .values({ storeId, adapter: 'fake', kind: 'discover', status: 'running' })
      .returning();
    const job = fetchJob({
      storeId,
      crawlJobId: cj!.id,
      adapterId: 'fake',
      ref: { kind: 'page', url: `${h.server.origin}/page/1` },
    });
    await expect(runFetch(h.deps, job)).rejects.toMatchObject({ name: 'CrawlOutcome', reportToSentry: true });
    const [row] = await h.catalog.db
      .select({
        errors: crawlJobs.errors,
        kinds: sql<string[]>`array(select e->>'kind' from jsonb_array_elements(${crawlJobs.errors}) e)`,
      })
      .from(crawlJobs)
      .where(eq(crawlJobs.id, cj!.id));
    expect(row!.kinds).toEqual(['parse']);
  });
});
