/**
 * 05 §5.1 on a real catalog: the `embed` job fetches the listing image through PoliteHttp
 * (in memory), stores vectors + phash, and handles gone / forbidden / blocked images and
 * long Crawl-delays. Models are faked; @cheapa/ml tests the real decoding and batching.
 */
import { RateDeferred } from '@cheapa/adapters';
import { send } from '@cheapa/adapters/testing';
import { IMAGE_VEC_DIMS, listingEmbeddings, listings, stores, TEXT_VEC_DIMS } from '@cheapa/db/catalog';
import { ImageDecodeError, type EmbedService } from '@cheapa/ml';
import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runEmbed } from './jobs/embed.js';
import type { EmbedJob } from './queues.js';
import { startHarness, type Harness } from './test/harness.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

/** Image vector [1, 0, ...], text vector from the title length; "<" bytes are not images. */
const fakeEmbed: EmbedService = {
  modelVersion: 'fake-image@q8+fake-text@q8',
  imageDims: IMAGE_VEC_DIMS,
  textDims: TEXT_VEC_DIMS,
  embedListing(bytes, title) {
    if (bytes[0] === '<'.charCodeAt(0)) return Promise.reject(new ImageDecodeError('not an image'));
    const imageVec = Array.from({ length: IMAGE_VEC_DIMS }, (_, i) => (i === 0 ? 1 : 0));
    const textVec = title ? Array.from({ length: TEXT_VEC_DIMS }, (_, i) => (i === 1 ? 1 : 0)) : null;
    return Promise.resolve({ imageVec, textVec, phash: -42n });
  },
  embedTitle: () => Promise.resolve([]),
  warmUp: () => Promise.resolve(),
};

let h: Harness;
let storeId: string;
beforeAll(async () => {
  h = await startHarness({
    '/img/dress.jpg': (res) => send(res, 200, JPEG.toString('latin1'), { 'content-type': 'image/jpeg' }),
    '/img/page.jpg': (res) => send(res, 200, '<html>not an image</html>', { 'content-type': 'image/jpeg' }),
    '/img/gone.jpg': (res) => send(res, 404),
    '/img/forbidden.jpg': (res) => send(res, 403),
    '/img/slow-down.jpg': (res) => send(res, 429),
  });
  h.deps.embed = fakeEmbed;
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.catalog.db.execute(sql`truncate stores, listings cascade`);
  h.alerts.length = 0;
  storeId = await h.addStore();
});

async function addListing(path: string): Promise<{ id: string; imageUrl: string }> {
  const imageUrl = h.server.origin + path;
  const [row] = await h.catalog.db
    .insert(listings)
    .values({
      storeId,
      externalId: path,
      sourceUrl: `${h.server.origin}/p${path}`,
      title: 'Black satin slip dress',
      priceKobo: 1_850_000,
      inStock: true,
      imageUrl,
    })
    .returning({ id: listings.id });
  return { id: row!.id, imageUrl };
}

/** The bits of a BullMQ job runEmbed touches. */
function fakeJob(data: EmbedJob) {
  const calls: { updated?: EmbedJob; delayedUntil?: number } = {};
  const job = {
    id: 'embed-test',
    data,
    updateData: (d: EmbedJob) => Promise.resolve(void (calls.updated = d)),
    moveToDelayed: (ts: number) => Promise.resolve(void (calls.delayedUntil = ts)),
  } as unknown as Job<EmbedJob>;
  return { job, calls };
}

const run = (data: EmbedJob) => runEmbed(h.deps, fakeJob(data).job, 'token');
const storeStatus = async () =>
  (await h.catalog.db.select({ s: stores.status }).from(stores).where(eq(stores.id, storeId)))[0]?.s;

describe('embed job', () => {
  it('stores image + title vectors, model version and phash', async () => {
    const l = await addListing('/img/dress.jpg');
    await expect(run({ listingId: l.id, imageUrl: l.imageUrl })).resolves.toEqual({ embedded: true });
    const [row] = await h.catalog.db
      .select()
      .from(listingEmbeddings)
      .where(eq(listingEmbeddings.listingId, l.id));
    expect(row?.modelVersion).toBe('fake-image@q8+fake-text@q8');
    expect(row?.imageVec?.[0]).toBe(1);
    expect(row?.textVec?.[1]).toBe(1);
    const [listing] = await h.catalog.db
      .select({ p: listings.phash })
      .from(listings)
      .where(eq(listings.id, l.id));
    expect(listing?.p).toBe(-42n);
    // Re-embedding replaces the row.
    await run({ listingId: l.id, imageUrl: l.imageUrl });
    expect(await h.catalog.db.$count(listingEmbeddings)).toBe(1);
  });

  it('skips listings that are gone or whose image changed since the job was queued', async () => {
    const l = await addListing('/img/dress.jpg');
    await expect(run({ listingId: l.id, imageUrl: `${h.server.origin}/img/old.jpg` })).resolves.toEqual({
      skipped: 'image_changed',
    });
    await expect(
      run({ listingId: '00000000-0000-4000-8000-000000000000', imageUrl: l.imageUrl }),
    ).resolves.toEqual({ skipped: 'missing' });
  });

  it('skips missing and undecodable images without retrying', async () => {
    const gone = await addListing('/img/gone.jpg');
    await expect(run({ listingId: gone.id, imageUrl: gone.imageUrl })).resolves.toEqual({
      skipped: 'not_found',
    });
    const page = await addListing('/img/page.jpg');
    await expect(run({ listingId: page.id, imageUrl: page.imageUrl })).resolves.toEqual({
      skipped: 'bad_image',
    });
    expect(await h.catalog.db.$count(listingEmbeddings)).toBe(0);
  });

  it('alerts on a 403 image without pausing the store', async () => {
    const l = await addListing('/img/forbidden.jpg');
    await expect(run({ listingId: l.id, imageUrl: l.imageUrl })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(h.alerts.map((a) => a.kind)).toEqual(['image_forbidden']);
    expect(await storeStatus()).toBe('active');
  });

  it('marks the store blocked on a 429 image', async () => {
    const l = await addListing('/img/slow-down.jpg');
    await expect(run({ listingId: l.id, imageUrl: l.imageUrl })).rejects.toBeInstanceOf(UnrecoverableError);
    expect(h.alerts.map((a) => a.kind)).toEqual(['store_blocked']);
    expect(await storeStatus()).toBe('blocked');
  });

  it('defers to the reserved slot when the host has a long Crawl-delay', async () => {
    const l = await addListing('/img/dress.jpg');
    const slotAt = Date.now() + 150_000;
    const seen: (number | undefined)[] = [];
    const imagesFor = h.deps.imagesFor;
    h.deps.imagesFor = () => ({
      getBytes: (_url, init) => {
        seen.push(init?.slotAt);
        return Promise.reject(new RateDeferred('cdn.test', slotAt));
      },
    });
    try {
      const { job, calls } = fakeJob({ listingId: l.id, imageUrl: l.imageUrl });
      await expect(runEmbed(h.deps, job, 'token')).rejects.toBeInstanceOf(DelayedError);
      expect(calls).toEqual({
        updated: { listingId: l.id, imageUrl: l.imageUrl, slotAt },
        delayedUntil: slotAt,
      });
      expect(seen).toEqual([undefined]);
    } finally {
      h.deps.imagesFor = imagesFor;
    }
  });
});
