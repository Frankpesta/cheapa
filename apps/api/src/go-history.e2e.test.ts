/**
 * 08 §8.4-8.5 acceptance: /go 302s at once and the click row appears (via the clicks
 * queue); a search writes one searches row; history pages, deletes, and moves to the
 * user on link.
 */
import { DEVICE_HEADER, SearchHistoryResponse, type SearchResponse } from '@cheapa/core';
import { listings, stores } from '@cheapa/db/catalog';
import { clicks, searches } from '@cheapa/db/users';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CLICKS_QUEUE_NAME, ClickJob, QUEUE_PREFIX } from './modules/go/click-job.js';
import { insertClick } from './modules/go/clicks.consumer.js';
import { liveListingId } from './modules/search/results.js';
import { type Harness, startHarness } from './test/harness.js';

let h: Harness;
let worker: Worker;
let workerRedis: Redis;
let cache: Redis;
const ids: Record<string, string> = {};
const ORIGIN = 'http://localhost:3000';

beforeAll(async () => {
  h = await startHarness();
  // The api-jobs consumer, in-process: same queue, same insert.
  workerRedis = new Redis(h.env.REDIS_QUEUE_URL, { maxRetriesPerRequest: null });
  worker = new Worker(CLICKS_QUEUE_NAME, (job) => insertClick(h.users.db, ClickJob.parse(job.data)), {
    connection: workerRedis,
    prefix: QUEUE_PREFIX,
  });
  cache = new Redis(h.env.REDIS_CACHE_URL);

  const { db } = h.catalog;
  const [jumia] = await db
    .insert(stores)
    .values({
      name: 'Jumia',
      domain: 'jumia.test',
      platform: 'custom',
      tier: 1,
      status: 'active',
      affiliate: {
        network: 'jumia',
        linkTemplate: 'https://aff.test/r?url={url}',
        subIdParam: 'sub',
        active: true,
      },
    })
    .returning({ id: stores.id });
  ids.store = jumia!.id;
  const base = { storeId: jumia!.id, title: 'Satin dress', priceKobo: 1_000_000, inStock: true };
  const [fresh, gone] = await db
    .insert(listings)
    .values([
      { ...base, externalId: 'a', sourceUrl: 'https://jumia.test/a' },
      {
        ...base,
        externalId: 'b',
        sourceUrl: 'https://jumia.test/b',
        lastSeenAt: new Date(Date.now() - 40 * 86_400_000),
      },
    ])
    .returning({ id: listings.id });
  ids.fresh = fresh!.id;
  ids.gone = gone!.id;
});

afterAll(async () => {
  await worker?.close();
  workerRedis?.disconnect();
  cache?.disconnect();
  await h?.stop();
});

async function eventually<T>(read: () => Promise<T | undefined>, ms = 5000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const clickRow = (listingId: string) =>
  eventually(async () => (await h.users.db.select().from(clicks).where(eq(clicks.listingId, listingId)))[0]);

describe('GET /go/:listingId', () => {
  it('302s to the affiliate link with the click id as sub-id, then the click row appears', async () => {
    const device = randomUUID();
    const s = randomUUID();
    const res = await h.app.inject({
      method: 'GET',
      url: `/go/${ids.fresh}?s=${s}`,
      headers: { [DEVICE_HEADER]: device },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers['cache-control']).toBe('no-store');
    const location = new URL(res.headers.location!);
    expect(location.origin + location.pathname).toBe('https://aff.test/r');
    expect(location.searchParams.get('url')).toBe('https://jumia.test/a');
    const clickId = location.searchParams.get('sub')!;

    const row = await clickRow(ids.fresh!);
    expect(row).toMatchObject({
      id: clickId,
      storeId: ids.store,
      affiliateNetwork: 'jumia',
      searchRequestId: s,
    });
    expect(row.deviceId).not.toBeNull();
  });

  it('sends a listing gone 30+ days to the store homepage, without a click', async () => {
    const res = await h.app.inject({ method: 'GET', url: `/go/${ids.gone}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://jumia.test/');
  });

  it('404s unknown and malformed ids; ignores a malformed search id', async () => {
    expect((await h.app.inject({ method: 'GET', url: `/go/${randomUUID()}` })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'GET', url: '/go/not-a-uuid' })).statusCode).toBe(404);
    expect((await h.app.inject({ method: 'GET', url: `/go/${ids.fresh}?s=nope` })).statusCode).toBe(302);
  });

  it('resolves a live-search listing from the saved link', async () => {
    const liveId = liveListingId(ids.store!, 'LIVE-1');
    const link = {
      listingId: liveId,
      storeId: ids.store,
      externalId: 'LIVE-1',
      sourceUrl: 'https://jumia.test/live-1',
    };
    await cache.set(`go:live:${liveId}`, JSON.stringify(link));
    const res = await h.app.inject({ method: 'GET', url: `/go/${liveId}` });
    expect(new URL(res.headers.location!).searchParams.get('url')).toBe('https://jumia.test/live-1');
    expect(await clickRow(liveId)).toMatchObject({ productId: null, storeId: ids.store });
  });
});

describe('clicks consumer', () => {
  it('keeps the click, anonymised, when its device no longer exists', async () => {
    const job = {
      id: randomUUID(),
      userId: null,
      deviceId: randomUUID(),
      listingId: randomUUID(),
      productId: null,
      storeId: ids.store!,
      affiliateNetwork: null,
      searchRequestId: null,
      at: new Date().toISOString(),
    };
    await insertClick(h.users.db, job);
    await insertClick(h.users.db, job); // a retry is a no-op
    const rows = await h.users.db.select().from(clicks).where(eq(clicks.id, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deviceId).toBeNull();
  });
});

describe('search history', () => {
  const device = randomUUID();
  const asDevice = { [DEVICE_HEADER]: device };
  const search = async (query: string) => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/search/text',
      headers: asDevice,
      payload: { query },
    });
    return res.json<SearchResponse>().requestId;
  };
  const history = async (headers: Record<string, string>, qs = '') =>
    SearchHistoryResponse.parse(
      (await h.app.inject({ method: 'GET', url: `/me/searches${qs}`, headers })).json(),
    );
  const rowFor = (id: string) =>
    eventually(async () => (await h.users.db.select().from(searches).where(eq(searches.id, id)))[0]);

  it('writes one row per search, pages newest first, deletes, and moves to the user on link', async () => {
    const first = await search('black satin slip dress');
    const row = await rowFor(first);
    expect(row).toMatchObject({
      source: 'text',
      query: 'black satin slip dress',
      imageHash: null,
      userId: null,
    });
    const second = await search('gold hoop earrings');
    const third = await search('body wave wig 22 inch');
    await rowFor(second);
    await rowFor(third);

    const page1 = await history(asDevice, '?limit=2');
    expect(page1.items.map((i) => i.id)).toEqual([third, second]);
    const page2 = await history(asDevice, `?limit=2&cursor=${page1.nextCursor}`);
    expect(page2.items.map((i) => i.id)).toEqual([first]);
    expect(page2.nextCursor).toBeNull();

    const del = await h.app.inject({ method: 'DELETE', url: `/me/searches/${second}`, headers: asDevice });
    expect(del.statusCode).toBe(204);
    expect(
      (await h.app.inject({ method: 'DELETE', url: `/me/searches/${second}`, headers: asDevice })).statusCode,
    ).toBe(404);
    // Another device can't see or delete them.
    expect((await history({ [DEVICE_HEADER]: randomUUID() })).items).toEqual([]);

    const user = { authorization: `Bearer ${h.signer.sign({ sub: 'user_history', azp: ORIGIN })}` };
    const link = await h.app.inject({
      method: 'POST',
      url: '/me/link-device',
      headers: { ...user, ...asDevice },
    });
    expect(link.statusCode).toBe(200);
    expect((await history(user)).items.map((i) => i.id)).toEqual([third, first]);
    // Linked rows belong to the user now, not the signed-out device.
    expect((await history(asDevice)).items).toEqual([]);

    expect((await h.app.inject({ method: 'DELETE', url: '/me/searches', headers: user })).statusCode).toBe(
      204,
    );
    expect((await history(user)).items).toEqual([]);
  });

  it('needs a device or a user', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/me/searches' })).statusCode).toBe(401);
  });
});
