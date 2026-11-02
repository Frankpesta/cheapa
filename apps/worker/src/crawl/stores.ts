import { StoreRef } from '@cheapa/core';
import { crawlJobs, stores, type CatalogDb } from '@cheapa/db/catalog';
import { and, eq, sql } from 'drizzle-orm';

/** Errors kept per crawl job; enough to diagnose, small enough for one row. */
const MAX_ERRORS = 50;

export interface CrawlableStore extends StoreRef {
  lastCrawledAt: Date | null;
}

const columns = {
  id: stores.id,
  name: stores.name,
  domain: stores.domain,
  platform: stores.platform,
  tier: stores.tier,
  status: stores.status,
  crawlPolicy: stores.crawlPolicy,
  lastCrawledAt: stores.lastCrawledAt,
};

function toStore(row: typeof stores.$inferSelect | Record<keyof typeof columns, unknown>): CrawlableStore {
  return { ...StoreRef.parse(row), lastCrawledAt: (row.lastCrawledAt as Date | null) ?? null };
}

/** Active stores whose robots.txt and terms were reviewed (crawlPolicy.robotsOk). */
export async function listCrawlableStores(db: CatalogDb): Promise<CrawlableStore[]> {
  const rows = await db
    .select(columns)
    .from(stores)
    .where(and(eq(stores.status, 'active'), sql`(${stores.crawlPolicy}->>'robotsOk')::boolean`));
  return rows.map(toStore);
}

export async function getStore(db: CatalogDb, id: string): Promise<CrawlableStore | null> {
  const [row] = await db.select(columns).from(stores).where(eq(stores.id, id));
  return row ? toStore(row) : null;
}

export function canCrawl(store: StoreRef): boolean {
  return store.status === 'active' && store.crawlPolicy.robotsOk;
}

export async function startCrawlJob(db: CatalogDb, storeId: string, adapter: string): Promise<string> {
  const now = new Date();
  const [row] = await db
    .insert(crawlJobs)
    .values({ storeId, adapter, kind: 'discover', status: 'running', startedAt: now })
    .returning({ id: crawlJobs.id });
  await db.update(stores).set({ lastCrawledAt: now }).where(eq(stores.id, storeId));
  return row!.id;
}

export async function finishCrawlJob(
  db: CatalogDb,
  id: string,
  status: 'succeeded' | 'failed' | 'blocked',
): Promise<void> {
  await db.update(crawlJobs).set({ status, finishedAt: new Date() }).where(eq(crawlJobs.id, id));
}

export async function addItemsFound(db: CatalogDb, id: string, count: number): Promise<void> {
  if (count === 0) return;
  await db
    .update(crawlJobs)
    .set({ itemsFound: sql`${crawlJobs.itemsFound} + ${count}` })
    .where(eq(crawlJobs.id, id));
}

/** Appends one error (no bodies, no PII: url, kind, message) up to MAX_ERRORS. */
export async function recordCrawlError(
  db: CatalogDb,
  id: string,
  error: { kind: string; url?: string; message: string },
): Promise<void> {
  await db
    .update(crawlJobs)
    .set({
      errors: sql`case when jsonb_array_length(${crawlJobs.errors}) < ${MAX_ERRORS}
        then ${crawlJobs.errors} || ${JSON.stringify([{ ...error, at: new Date().toISOString() }])}::jsonb
        else ${crawlJobs.errors} end`,
    })
    .where(eq(crawlJobs.id, id));
}

export async function markStoreBlocked(db: CatalogDb, storeId: string): Promise<void> {
  await db.update(stores).set({ status: 'blocked' }).where(eq(stores.id, storeId));
}

/** Keeps price_history partitions 3 months ahead (hand-written migration function). */
export async function ensurePartitions(db: CatalogDb, monthsAhead = 3): Promise<void> {
  await db.execute(sql`select ensure_price_history_partitions(${monthsAhead})`);
}
