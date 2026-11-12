/**
 * Crawl-run progress and the numbers the health rules need (02-crawler-core.md 2.5,
 * 11-compliance-and-ops.md 11.3). SQL only; the rules live in jobs/health.ts.
 */
import { daysBefore, LISTING_HIDDEN_DAYS } from '@cheapa/core';
import { crawlJobs, listings, type CatalogDb } from '@cheapa/db/catalog';
import { and, eq, gte, isNotNull, isNull, ne, sql } from 'drizzle-orm';

export type CrawlRun = typeof crawlJobs.$inferSelect;

/** Discover finished enqueuing: the run is complete once this many fetches finish. */
export async function setRefsTotal(db: CatalogDb, id: string, refs: number): Promise<void> {
  await db.update(crawlJobs).set({ refsTotal: refs }).where(eq(crawlJobs.id, id));
}

export async function countFetch(db: CatalogDb, id: string, failed: boolean): Promise<void> {
  await db
    .update(crawlJobs)
    .set(
      failed
        ? { fetchesFailed: sql`${crawlJobs.fetchesFailed} + 1` }
        : { fetchesDone: sql`${crawlJobs.fetchesDone} + 1` },
    )
    .where(eq(crawlJobs.id, id));
}

/**
 * Atomically marks a complete run as checked. Returns the run for exactly one caller
 * (the last fetch, or discover if the fetches beat it), null for everyone else.
 */
export async function claimHealthCheck(db: CatalogDb, id: string): Promise<CrawlRun | null> {
  const [run] = await db
    .update(crawlJobs)
    .set({ healthCheckedAt: sql`now()` })
    .where(
      and(
        eq(crawlJobs.id, id),
        isNull(crawlJobs.healthCheckedAt),
        isNotNull(crawlJobs.refsTotal),
        sql`${crawlJobs.fetchesDone} + ${crawlJobs.fetchesFailed} >= ${crawlJobs.refsTotal}`,
      ),
    )
    .returning();
  return run ?? null;
}

/** Median itemsFound of the store's other completed runs since `since`; null with < 2 runs. */
export async function medianItemsFound(
  db: CatalogDb,
  storeId: string,
  since: Date,
  excludeId: string,
): Promise<number | null> {
  const [row] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      median: sql<number | null>`percentile_cont(0.5) within group (order by ${crawlJobs.itemsFound})`,
    })
    .from(crawlJobs)
    .where(
      and(
        eq(crawlJobs.storeId, storeId),
        ne(crawlJobs.id, excludeId),
        eq(crawlJobs.status, 'succeeded'),
        gte(crawlJobs.healthCheckedAt, since),
      ),
    );
  return row && row.runs >= 2 && row.median !== null ? Number(row.median) : null;
}

export interface Freshness {
  /** Listings still visible in search (seen within LISTING_HIDDEN_DAYS). */
  visible: number;
  /** Of those, seen in the last 48 h. */
  fresh: number;
}

export async function storeFreshness(db: CatalogDb, storeId: string, now: Date): Promise<Freshness> {
  const [row] = await db
    .select({
      visible: sql<number>`count(*)::int`,
      fresh: sql<number>`(count(*) filter (where ${listings.lastSeenAt} >= ${daysBefore(now, 2)}))::int`,
    })
    .from(listings)
    .where(
      and(eq(listings.storeId, storeId), gte(listings.lastSeenAt, daysBefore(now, LISTING_HIDDEN_DAYS))),
    );
  return { visible: row?.visible ?? 0, fresh: row?.fresh ?? 0 };
}

/** True when next month's price_history partition exists (11-compliance-and-ops.md 11.3). */
export async function nextPartitionExists(db: CatalogDb, now: Date): Promise<boolean> {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  // Same naming as ensure_price_history_partitions() (migration 0001).
  const name = `price_history_y${next.getUTCFullYear()}m${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  const result = await db.execute<{ found: boolean }>(sql`select to_regclass(${name}) is not null as found`);
  return result.rows[0]?.found === true;
}
