/**
 * Phase 05 matching (04 §4.3, 13 §13.4) on a real catalog: candidates from image and
 * title vectors, image similarity in the score, the phash supplier-photo key, and fashion
 * waiting for its embed before it can found a product.
 */
import {
  canonicalProducts,
  IMAGE_VEC_DIMS,
  listingEmbeddings,
  listings,
  TEXT_VEC_DIMS,
} from '@cheapa/db/catalog';
import type { Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMatch } from './jobs/match.js';
import type { MatchJob } from './queues.js';
import { startHarness, type Harness } from './test/harness.js';

const MODEL = 'fake-image@q8+fake-text@q8';

/** Deterministic unit vector for a "design"; `noise` mixes in a second design. */
function vec(design: string, dims: number, noise = 0, other = 'noise'): number[] {
  const base = (seed: string) => {
    let x = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    return Array.from({ length: dims }, () => {
      x = (x * 1_103_515_245 + 12_345) >>> 0;
      return x / 2 ** 32 - 0.5;
    });
  };
  const a = base(design);
  const b = base(other);
  const v = a.map((x, i) => x * (1 - noise) + (b[i] ?? 0) * noise);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

let h: Harness;
let storeId: string;
let seq = 0;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.stop());
beforeEach(async () => {
  await h.catalog.db.execute(sql`truncate stores, listings, canonical_products cascade`);
  storeId = await h.addStore();
  h.deps.matchAfterEmbed = false;
});

interface Add {
  title: string;
  design?: string;
  noise?: number;
  phash?: bigint;
  modelVersion?: string;
  image?: boolean;
}

/** A clothing/dresses listing, optionally with embeddings. */
async function add(a: Add): Promise<string> {
  seq += 1;
  const [row] = await h.catalog.db
    .insert(listings)
    .values({
      storeId,
      externalId: `L${seq}`,
      sourceUrl: `https://shop.test/L${seq}`,
      title: a.title,
      priceKobo: 1_500_000,
      inStock: true,
      department: 'clothing',
      category: 'dresses',
      variant: { audience: 'women' },
      imageUrl: a.image === false ? null : `https://img.test/L${seq}.jpg`,
      phash: a.phash ?? null,
    })
    .returning({ id: listings.id });
  if (a.design) {
    await h.catalog.db.insert(listingEmbeddings).values({
      listingId: row!.id,
      imageVec: vec(a.design, IMAGE_VEC_DIMS, a.noise ?? 0),
      textVec: vec(a.title, TEXT_VEC_DIMS),
      modelVersion: a.modelVersion ?? MODEL,
    });
  }
  return row!.id;
}

const match = (listingId: string, afterEmbed?: boolean) =>
  runMatch(h.deps, {
    id: `m${listingId}`,
    data: { listingId, ...(afterEmbed ? { afterEmbed } : {}) },
  } as Job<MatchJob>);
const productCount = () => h.catalog.db.$count(canonicalProducts);

describe('vector matching', () => {
  it('merges the same dress photographed by another store, keeps a different dress apart', async () => {
    expect(await match(await add({ title: 'Wine satin slip dress', design: 'slip' }))).toMatchObject({
      decision: 'new',
    });
    // Different words, near-identical photo.
    const same = await match(
      await add({ title: 'Classy midi dress for ladies', design: 'slip', noise: 0.05 }),
    );
    expect(same).toMatchObject({ decision: 'merge' });
    // Same words, different photo.
    const other = await match(await add({ title: 'Wine satin slip dress', design: 'bodycon' }));
    expect(other).toMatchObject({ decision: 'new' });
    expect(await productCount()).toBe(2);
  });

  it('merges on the supplier photo (phash) even without vectors', async () => {
    await match(await add({ title: 'Ankara gown', phash: 0x0f0f_0f0f_0f0f_0f0fn }));
    const r = await match(await add({ title: 'Owambe dress', phash: 0x0f0f_0f0f_0f0f_0f0en }));
    expect(r).toMatchObject({ decision: 'merge', score: 1 });
    expect(await productCount()).toBe(1);
  });

  it('ignores vectors from another model version', async () => {
    await match(await add({ title: 'Black corset top', design: 'corset', modelVersion: 'old-model' }));
    const r = await match(await add({ title: 'Lace top', design: 'corset' }));
    expect(r).toMatchObject({ decision: 'new' });
  });
});

describe('fashion waits for its embed', () => {
  it('skips a listing with an image and no vector until the embed job hands it over', async () => {
    h.deps.matchAfterEmbed = true;
    const id = await add({ title: 'Satin maxi skirt' });
    expect(await match(id)).toEqual({ skipped: 'awaiting_embed' });
    expect(await productCount()).toBe(0);
    expect(await match(id, true)).toMatchObject({ decision: 'new' });
  });

  it('matches at once when there is no image to wait for', async () => {
    h.deps.matchAfterEmbed = true;
    expect(await match(await add({ title: 'Wrap dress', image: false }))).toMatchObject({ decision: 'new' });
  });

  it('a listing that already has its vector does not wait', async () => {
    h.deps.matchAfterEmbed = true;
    expect(await match(await add({ title: 'Peplum top', design: 'peplum' }))).toMatchObject({
      decision: 'new',
    });
    const [p] = await h.catalog.db
      .select()
      .from(canonicalProducts)
      .where(eq(canonicalProducts.title, 'Peplum top'));
    expect(p).toBeDefined();
  });
});
