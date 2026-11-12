/**
 * cheapa_catalog schema (01-foundation.md 1.4, 13-fashion-and-beauty.md).
 * Managed by drizzle-kit. price_history is partitioned and lives in
 * price-history.ts with a hand-written migration.
 *
 * Money columns are bigint kobo read as JS numbers (safe to ₦90 trillion).
 */
import type { CrawlPolicy, Variant } from '@cheapa/core';
import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  halfvec,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  condition,
  crawlKind,
  crawlStatus,
  department,
  matchDecision,
  priceKind,
  storePlatform,
  storeStatus,
} from './enums.js';

/** Image and text embedding sizes; change together with listing_embeddings.model_version. */
export const IMAGE_VEC_DIMS = 512;
export const TEXT_VEC_DIMS = 384;

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });
const kobo = (name: string) => bigint(name, { mode: 'number' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export interface StoreAffiliate {
  network: string;
  linkTemplate: string;
  subIdParam: string;
  active: boolean;
}

export const stores = pgTable(
  'stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    domain: text('domain').notNull().unique(),
    platform: storePlatform('platform').notNull(),
    tier: smallint('tier').notNull(),
    status: storeStatus('status').notNull().default('candidate'),
    crawlPolicy: jsonb('crawl_policy').$type<CrawlPolicy>().notNull().default({ robotsOk: false, maxRps: 1 }),
    affiliate: jsonb('affiliate').$type<StoreAffiliate>(),
    lastCrawledAt: timestamp('last_crawled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check('stores_tier_range', sql`${t.tier} between 1 and 5`)],
);

export const canonicalProducts = pgTable(
  'canonical_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    department: department('department').notNull(),
    category: text('category'),
    brand: text('brand'),
    model: text('model'),
    modelNumber: text('model_number'),
    gtin: text('gtin'),
    /** Hard variant attributes only (soft ones like size/colour live on listings). */
    variant: jsonb('variant').$type<Variant>().notNull().default({}),
    repImageUrl: text('rep_image_url'),
    minPriceKobo: kobo('min_price_kobo'),
    maxPriceKobo: kobo('max_price_kobo'),
    listingCount: integer('listing_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('canonical_products_department_category_idx').on(t.department, t.category),
    index('canonical_products_gtin_idx').on(t.gtin),
    // Matcher candidate retrieval by title similarity (04 §4.3) until vectors exist.
    index('canonical_products_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
  ],
);

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    sourceUrl: text('source_url').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    model: text('model'),
    modelNumber: text('model_number'),
    gtin: text('gtin'),
    department: department('department').notNull().default('other'),
    category: text('category'),
    categoryPath: text('category_path')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    condition: condition('condition').notNull().default('unknown'),
    variant: jsonb('variant').$type<Variant>().notNull().default({}),
    /** Store facts without a column yet (rawTitle, rating, fulfilment...). Never descriptions. */
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    priceKobo: kobo('price_kobo').notNull(),
    priceKind: priceKind('price_kind').notNull().default('exact'),
    priceMaxKobo: kobo('price_max_kobo'),
    oldPriceKobo: kobo('old_price_kobo'),
    currency: text('currency').notNull().default('NGN'),
    inStock: boolean('in_stock').notNull(),
    /** Store's image URL only; images are never stored (CLAUDE.md rule 3). */
    imageUrl: text('image_url'),
    phash: bigint('phash', { mode: 'bigint' }),
    sellerName: text('seller_name'),
    region: text('region'),
    sponsored: boolean('sponsored').notNull().default(false),
    canonicalProductId: uuid('canonical_product_id').references(() => canonicalProducts.id, {
      onDelete: 'set null',
    }),
    /** 'simple' config keeps model codes ("A3102", "13x4") intact for full-text search. */
    search: tsvector('search').generatedAlwaysAs(
      (): SQL =>
        sql`to_tsvector('simple', coalesce(${listings.title}, '') || ' ' || coalesce(${listings.brand}, '') || ' ' || coalesce(${listings.model}, '') || ' ' || coalesce(${listings.modelNumber}, ''))`,
    ),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('listings_store_external_uq').on(t.storeId, t.externalId),
    index('listings_canonical_product_idx').on(t.canonicalProductId),
    index('listings_last_seen_idx').on(t.lastSeenAt),
    index('listings_department_category_idx').on(t.department, t.category),
    index('listings_search_idx').using('gin', t.search),
    index('listings_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    check('listings_price_positive', sql`${t.priceKobo} > 0`),
    check('listings_price_max_gte', sql`${t.priceMaxKobo} is null or ${t.priceMaxKobo} >= ${t.priceKobo}`),
    check('listings_old_price_positive', sql`${t.oldPriceKobo} is null or ${t.oldPriceKobo} > 0`),
    check('listings_currency_ngn', sql`${t.currency} = 'NGN'`),
  ],
);

export const listingEmbeddings = pgTable(
  'listing_embeddings',
  {
    listingId: uuid('listing_id')
      .primaryKey()
      .references(() => listings.id, { onDelete: 'cascade' }),
    /** halfvec: half the memory of vector, negligible recall loss (DECISIONS.md). */
    imageVec: halfvec('image_vec', { dimensions: IMAGE_VEC_DIMS }),
    textVec: halfvec('text_vec', { dimensions: TEXT_VEC_DIMS }),
    modelVersion: text('model_version').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('listing_embeddings_image_hnsw').using('hnsw', t.imageVec.op('halfvec_cosine_ops')),
    index('listing_embeddings_text_hnsw').using('hnsw', t.textVec.op('halfvec_cosine_ops')),
  ],
);

export const matchReviews = pgTable(
  'match_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    candidateProductId: uuid('candidate_product_id')
      .notNull()
      .references(() => canonicalProducts.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    decision: matchDecision('decision'),
    /** Internal admin id (Clerk user id). No other user data in the catalog. */
    reviewer: text('reviewer'),
    createdAt: createdAt(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (t) => [
    index('match_reviews_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.decision} is null`),
  ],
);

export const crawlJobs = pgTable(
  'crawl_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    adapter: text('adapter').notNull(),
    kind: crawlKind('kind').notNull(),
    status: crawlStatus('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    itemsFound: integer('items_found').notNull().default(0),
    itemsChanged: integer('items_changed').notNull().default(0),
    /** Fetch refs discover enqueued; null while discover is still running. */
    refsTotal: integer('refs_total'),
    /** Fetches finished (including skipped refs) and fetches that failed for good. */
    fetchesDone: integer('fetches_done').notNull().default(0),
    fetchesFailed: integer('fetches_failed').notNull().default(0),
    /** Set once when the run is complete and its health rules ran (02-crawler-core.md 2.5). */
    healthCheckedAt: timestamp('health_checked_at', { withTimezone: true }),
    errors: jsonb('errors').$type<unknown[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('crawl_jobs_store_created_idx').on(t.storeId, t.createdAt)],
);
