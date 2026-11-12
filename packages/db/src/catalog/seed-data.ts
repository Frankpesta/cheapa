/**
 * Local development seed: 3 tier-1 stores and 10 FAKE listings (01-foundation.md 1.4).
 * Every listing has externalId "seed-*" and attributes.seed = true. Vectors are
 * synthetic: listings of the same design share a base vector plus small noise, so
 * nearest-neighbour order is predictable.
 */
import type { Department } from '@cheapa/core';
import { sql } from 'drizzle-orm';
import type { CatalogDb } from './client.js';
import { priceHistory } from './price-history.js';
import { IMAGE_VEC_DIMS, listingEmbeddings, listings, stores } from './schema.js';

export const SEED_MODEL_VERSION = 'seed-synthetic-v1';

/**
 * Tier-1 stores. `robotsOk` is true only once robots.txt and terms were reviewed and the
 * adapter exists (docs/sources/<store>.md); the scheduler crawls nothing else.
 */
const SEED_STORES = [
  {
    key: 'jumia',
    name: 'Jumia',
    domain: 'www.jumia.com.ng',
    platform: 'custom',
    tier: 1,
    status: 'active',
    crawlPolicy: {
      robotsOk: true,
      maxRps: 2,
      notes: 'robots.txt 2026-11-12: identified bots allowed under 200 rpm; docs/sources/jumia.md',
    },
  },
  {
    key: 'konga',
    name: 'Konga',
    domain: 'www.konga.com',
    platform: 'custom',
    tier: 1,
    // Cloudflare blocks CheapaBot (403, even robots.txt): partnership track, never crawled.
    status: 'blocked',
    crawlPolicy: {
      robotsOk: false,
      maxRps: 1,
      notes: 'blocked by Cloudflare 2026-11-12; docs/sources/konga.md',
    },
  },
  {
    key: 'jiji',
    name: 'Jiji',
    domain: 'jiji.ng',
    platform: 'custom',
    tier: 1,
    status: 'active',
    crawlPolicy: {
      robotsOk: true,
      maxRps: 1,
      notes: 'robots.txt 2026-11-12 allows /api_web/ for all agents; docs/sources/jiji.md',
    },
  },
] as const;

type StoreKey = (typeof SEED_STORES)[number]['key'];

interface SeedListing {
  design: string;
  store: StoreKey;
  title: string;
  naira: number;
  department: Department;
  category: string;
}

/** Five designs; listings sharing a design are "the same item" at different stores. */
export const SEED_LISTINGS: SeedListing[] = [
  {
    design: 'slip-dress',
    store: 'jumia',
    title: 'Women Black Satin Slip Dress Midi',
    naira: 18_500,
    department: 'clothing',
    category: 'dresses',
  },
  {
    design: 'slip-dress',
    store: 'konga',
    title: 'Black Satin Cowl Neck Slip Dress',
    naira: 16_900,
    department: 'clothing',
    category: 'dresses',
  },
  {
    design: 'slip-dress',
    store: 'jiji',
    title: 'Satin slip dress black (all sizes)',
    naira: 15_000,
    department: 'clothing',
    category: 'dresses',
  },
  {
    design: 'wig',
    store: 'jumia',
    title: '13x4 HD Lace Bone Straight Human Hair Wig 24 Inch',
    naira: 185_000,
    department: 'hair',
    category: 'wigs',
  },
  {
    design: 'wig',
    store: 'jiji',
    title: 'Bone straight frontal wig 24" 13x4',
    naira: 160_000,
    department: 'hair',
    category: 'wigs',
  },
  {
    design: 'sneakers',
    store: 'jumia',
    title: 'Ladies Chunky Sole White Sneakers',
    naira: 9_900,
    department: 'shoes',
    category: 'sneakers',
  },
  {
    design: 'sneakers',
    store: 'konga',
    title: 'Women White Platform Chunky Sneakers',
    naira: 11_500,
    department: 'shoes',
    category: 'sneakers',
  },
  {
    design: 'earrings',
    store: 'jumia',
    title: 'Gold Plated Chunky Hoop Earrings',
    naira: 3_886,
    department: 'bags_accessories',
    category: 'jewellery',
  },
  {
    design: 'phone',
    store: 'jumia',
    title: 'Tecno Camon 30 8GB/256GB',
    naira: 443_162,
    department: 'electronics',
    category: 'phones',
  },
  {
    design: 'phone',
    store: 'konga',
    title: 'TECNO CAMON 30 256GB 8GB RAM',
    naira: 450_000,
    department: 'electronics',
    category: 'phones',
  },
];

/** Deterministic PRNG (mulberry32) so seeds and tests are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function normalise(v: number[]): number[] {
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

/** Base vector for a design. */
export function designVector(design: string, dims = IMAGE_VEC_DIMS): number[] {
  const next = rng(hash(design));
  return normalise(Array.from({ length: dims }, () => next() * 2 - 1));
}

/** A listing's vector: its design's base vector plus a little noise. */
export function listingVector(design: string, salt: string, dims = IMAGE_VEC_DIMS, noise = 0.15): number[] {
  const base = designVector(design, dims);
  const next = rng(hash(`${design}:${salt}`));
  return normalise(base.map((x) => x + (next() * 2 - 1) * (noise / Math.sqrt(dims)) * 4));
}

export async function seedCatalog(db: CatalogDb): Promise<{ stores: number; listings: number }> {
  return db.transaction(async (tx) => {
    const storeRows = await tx
      .insert(stores)
      .values(
        SEED_STORES.map(({ key: _key, crawlPolicy, ...s }) => ({
          ...s,
          crawlPolicy: { ...crawlPolicy },
        })),
      )
      // The reviewed policy is the source of truth for these stores: re-seeding applies it.
      .onConflictDoUpdate({
        target: stores.domain,
        set: {
          name: sql`excluded.name`,
          status: sql`excluded.status`,
          crawlPolicy: sql`excluded.crawl_policy`,
        },
      })
      .returning({ id: stores.id, domain: stores.domain });
    const storeId = (key: StoreKey) => {
      const domain = SEED_STORES.find((s) => s.key === key)?.domain;
      const row = storeRows.find((r) => r.domain === domain);
      if (!row) throw new Error(`seed store missing: ${key}`);
      return row.id;
    };

    for (const [i, l] of SEED_LISTINGS.entries()) {
      const externalId = `seed-${l.design}-${l.store}`;
      const [row] = await tx
        .insert(listings)
        .values({
          storeId: storeId(l.store),
          externalId,
          sourceUrl: `https://${SEED_STORES.find((s) => s.key === l.store)?.domain}/${externalId}`,
          title: l.title,
          department: l.department,
          category: l.category,
          condition: l.store === 'jiji' ? 'used' : 'new',
          priceKobo: l.naira * 100,
          inStock: true,
          attributes: { seed: true },
        })
        .onConflictDoUpdate({
          target: [listings.storeId, listings.externalId],
          set: { title: sql`excluded.title`, priceKobo: sql`excluded.price_kobo`, lastSeenAt: sql`now()` },
        })
        // xmax = 0 only for freshly inserted rows, so re-seeding adds no history.
        .returning({ id: listings.id, inserted: sql<boolean>`(xmax = 0)` });
      if (!row) throw new Error(`seed listing not written: ${externalId}`);

      await tx
        .insert(listingEmbeddings)
        .values({
          listingId: row.id,
          imageVec: listingVector(l.design, String(i)),
          modelVersion: SEED_MODEL_VERSION,
        })
        .onConflictDoUpdate({
          target: listingEmbeddings.listingId,
          set: { imageVec: sql`excluded.image_vec`, modelVersion: sql`excluded.model_version` },
        });

      if (row.inserted) {
        await tx.insert(priceHistory).values({ listingId: row.id, priceKobo: l.naira * 100, inStock: true });
      }
    }
    return { stores: storeRows.length, listings: SEED_LISTINGS.length };
  });
}
