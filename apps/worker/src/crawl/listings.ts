/**
 * Listing upsert and change detection (02-crawler-core.md 2.4). price_history rows and
 * `price.changed` events are written ONLY when price or stock changed, or the listing
 * is new; a re-crawl of an unchanged page writes nothing but `last_seen_at`.
 */
import type { NormalizedListing, PriceChangedEvent } from '@cheapa/core';
import { crawlJobs, listings, priceHistory, type CatalogDb } from '@cheapa/db/catalog';
import { and, asc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';

type Tx = Parameters<Parameters<CatalogDb['transaction']>[0]>[0];

export interface UpsertContext {
  storeId: string;
  storeName: string;
  crawlJobId: string;
  /** When the payload was fetched: last_seen_at and price_history.observed_at. */
  observedAt: Date;
}

export interface EmbedRequest {
  listingId: string;
  imageUrl: string;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  /** Older than what is stored (a late retry); left untouched. */
  outdated: number;
  events: PriceChangedEvent[];
  embeds: EmbedRequest[];
}

/** Last one wins when a payload repeats an externalId (one row per key per statement). */
function dedupe(rows: readonly NormalizedListing[]): NormalizedListing[] {
  const byId = new Map(rows.map((r) => [r.externalId, r]));
  return [...byId.values()].sort((a, b) => (a.externalId < b.externalId ? -1 : 1));
}

function toRow(storeId: string, n: NormalizedListing, observedAt: Date): typeof listings.$inferInsert {
  return {
    storeId,
    externalId: n.externalId,
    sourceUrl: n.sourceUrl,
    title: n.title,
    brand: n.brand ?? null,
    model: n.model ?? null,
    modelNumber: n.modelNumber ?? null,
    gtin: n.gtin ?? null,
    department: n.department,
    category: n.category,
    categoryPath: n.categoryPath,
    condition: n.condition,
    variant: n.variant,
    attributes: { ...n.attributes, extractionConfidence: n.extractionConfidence },
    priceKobo: n.priceKobo,
    priceKind: n.priceKind,
    priceMaxKobo: n.priceMaxKobo ?? null,
    oldPriceKobo: n.oldPriceKobo ?? null,
    currency: n.currency,
    inStock: n.inStock,
    imageUrl: n.imageUrl ?? null,
    sellerName: n.sellerName ?? null,
    region: n.region ?? null,
    sponsored: n.sponsored,
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
  };
}

/** Every store-fact column is refreshed; identity, first_seen_at and matching are kept. */
const REFRESHED = [
  'sourceUrl',
  'title',
  'brand',
  'model',
  'modelNumber',
  'gtin',
  'department',
  'category',
  'categoryPath',
  'condition',
  'variant',
  'attributes',
  'priceKobo',
  'priceKind',
  'priceMaxKobo',
  'oldPriceKobo',
  'inStock',
  'imageUrl',
  'sellerName',
  'region',
  'sponsored',
  'lastSeenAt',
] as const satisfies readonly (keyof typeof listings.$inferInsert)[];

const UPDATE_SET: Record<string, SQL> = Object.fromEntries(
  REFRESHED.map((key) => [key, sql.raw(`excluded.${listings[key].name}`)]),
);

/**
 * Upserts one payload's listings in one transaction. Existing rows are locked first
 * (in key order, so concurrent jobs can't deadlock) to read their previous price and
 * stock. `onCommitting` runs inside the transaction, after the writes: if it throws,
 * nothing is committed and the job retries (events are at-least-once).
 */
export async function upsertListings(
  db: CatalogDb,
  ctx: UpsertContext,
  input: readonly NormalizedListing[],
  onCommitting: (result: UpsertResult) => Promise<void>,
): Promise<UpsertResult> {
  const rows = dedupe(input);
  return db.transaction(async (tx) => {
    const previous = await lockExisting(
      tx,
      ctx.storeId,
      rows.map((r) => r.externalId),
    );
    const written = await tx
      .insert(listings)
      .values(rows.map((r) => toRow(ctx.storeId, r, ctx.observedAt)))
      .onConflictDoUpdate({
        target: [listings.storeId, listings.externalId],
        set: { ...UPDATE_SET, updatedAt: sql`now()` },
        // A late retry must not overwrite fresher data.
        setWhere: sql`excluded.last_seen_at >= ${listings.lastSeenAt}`,
      })
      .returning({ id: listings.id, externalId: listings.externalId, inserted: sql<boolean>`xmax = 0` });

    const result: UpsertResult = {
      inserted: 0,
      updated: 0,
      outdated: rows.length - written.length,
      events: [],
      embeds: [],
    };
    const byExternal = new Map(rows.map((r) => [r.externalId, r]));
    const history: (typeof priceHistory.$inferInsert)[] = [];
    for (const w of written) {
      const now = byExternal.get(w.externalId)!;
      const before = previous.get(w.externalId);
      if (w.inserted) result.inserted += 1;
      else result.updated += 1;
      // A row inserted by a concurrent job between our lock and our insert has no
      // `before`; that job already recorded its history.
      const changed =
        w.inserted || (before && (before.priceKobo !== now.priceKobo || before.inStock !== now.inStock));
      if (changed) {
        history.push({
          listingId: w.id,
          priceKobo: now.priceKobo,
          inStock: now.inStock,
          observedAt: ctx.observedAt,
        });
        result.events.push({
          type: 'price.changed',
          listingId: w.id,
          productId: before?.canonicalProductId ?? null,
          storeId: ctx.storeId,
          storeName: ctx.storeName,
          condition: now.condition,
          oldPriceKobo: before?.priceKobo ?? null,
          newPriceKobo: now.priceKobo,
          wasInStock: before?.inStock ?? null,
          inStock: now.inStock,
          observedAt: ctx.observedAt.toISOString(),
        });
      }
      const imageChanged = w.inserted || (before && before.imageUrl !== (now.imageUrl ?? null));
      if (imageChanged && now.imageUrl) result.embeds.push({ listingId: w.id, imageUrl: now.imageUrl });
    }
    if (history.length > 0) await tx.insert(priceHistory).values(history);
    if (result.events.length > 0) {
      await tx
        .update(crawlJobs)
        .set({ itemsChanged: sql`${crawlJobs.itemsChanged} + ${result.events.length}` })
        .where(eq(crawlJobs.id, ctx.crawlJobId));
    }
    await onCommitting(result);
    return result;
  });
}

async function lockExisting(tx: Tx, storeId: string, externalIds: string[]) {
  const rows = await tx
    .select({
      externalId: listings.externalId,
      priceKobo: listings.priceKobo,
      inStock: listings.inStock,
      imageUrl: listings.imageUrl,
      canonicalProductId: listings.canonicalProductId,
    })
    .from(listings)
    .where(and(eq(listings.storeId, storeId), inArray(listings.externalId, externalIds)))
    .orderBy(asc(listings.externalId))
    .for('update');
  return new Map(rows.map((r) => [r.externalId, r]));
}

/**
 * After a store sweep: in-stock listings unseen since `cutoff` go out of stock, with a
 * price_history row and an event each (a watcher cares when an item disappears).
 */
export async function markUnseenOutOfStock(
  db: CatalogDb,
  store: { id: string; name: string },
  cutoff: Date,
  now: Date,
  onCommitting: (events: PriceChangedEvent[]) => Promise<void>,
): Promise<number> {
  return db.transaction(async (tx) => {
    const stale = await tx
      .update(listings)
      .set({ inStock: false, updatedAt: sql`now()` })
      .where(and(eq(listings.storeId, store.id), eq(listings.inStock, true), lt(listings.lastSeenAt, cutoff)))
      .returning({
        id: listings.id,
        priceKobo: listings.priceKobo,
        condition: listings.condition,
        canonicalProductId: listings.canonicalProductId,
      });
    if (stale.length === 0) return 0;
    // Chunked: a big store can drop thousands of listings at once (65k bind-parameter cap).
    for (let i = 0; i < stale.length; i += 5000) {
      await tx
        .insert(priceHistory)
        .values(
          stale
            .slice(i, i + 5000)
            .map((s) => ({ listingId: s.id, priceKobo: s.priceKobo, inStock: false, observedAt: now })),
        );
    }
    await onCommitting(
      stale.map((s) => ({
        type: 'price.changed',
        listingId: s.id,
        productId: s.canonicalProductId,
        storeId: store.id,
        storeName: store.name,
        condition: s.condition,
        oldPriceKobo: s.priceKobo,
        newPriceKobo: s.priceKobo,
        wasInStock: true,
        inStock: false,
        observedAt: now.toISOString(),
      })),
    );
    return stale.length;
  });
}
