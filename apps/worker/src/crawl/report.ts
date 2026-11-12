/** Per-store crawl health rows for scripts/crawl-report.ts (and the admin page later). */
import { daysBefore } from '@cheapa/core';
import { crawlJobs, stores, type CatalogDb } from '@cheapa/db/catalog';
import { desc, eq } from 'drizzle-orm';
import { medianItemsFound, storeFreshness } from './health.js';

export interface StoreReportRow {
  store: string;
  tier: number;
  status: string;
  lastRun: string;
  runStatus: string;
  items: number | string;
  median7d: number | string;
  changed: number | string;
  errors: string;
  fresh48h: string;
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '-');

export async function storeReport(db: CatalogDb, now = new Date()): Promise<StoreReportRow[]> {
  const rows: StoreReportRow[] = [];
  for (const store of await db.select().from(stores).orderBy(stores.tier, stores.name)) {
    const [run] = await db
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.storeId, store.id))
      .orderBy(desc(crawlJobs.createdAt))
      .limit(1);
    const [median, fresh] = await Promise.all([
      run ? medianItemsFound(db, store.id, daysBefore(now, 7), run.id) : Promise.resolve(null),
      storeFreshness(db, store.id, now),
    ]);
    const complete = run?.healthCheckedAt ? '' : run ? ' (running)' : '';
    rows.push({
      store: store.name,
      tier: store.tier,
      status: store.status,
      lastRun: run?.startedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? 'never',
      runStatus: run ? `${run.status}${complete}` : '-',
      items: run?.itemsFound ?? '-',
      median7d: median ?? '-',
      changed: run?.itemsChanged ?? '-',
      errors: run?.refsTotal
        ? `${run.fetchesFailed}/${run.refsTotal} (${pct(run.fetchesFailed, run.refsTotal)})`
        : '-',
      fresh48h: `${pct(fresh.fresh, fresh.visible)} of ${fresh.visible}`,
    });
  }
  return rows;
}

/** Plain fixed-width table; no dependencies. */
export function renderTable(rows: readonly StoreReportRow[]): string {
  if (rows.length === 0) return 'No stores.\n';
  const headers = Object.keys(rows[0]!) as (keyof StoreReportRow)[];
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
  const line = (cells: string[]) =>
    cells
      .map((c, i) => c.padEnd(widths[i]!))
      .join('  ')
      .trimEnd();
  return (
    [
      line(headers),
      line(widths.map((w) => '-'.repeat(w))),
      ...rows.map((r) => line(headers.map((h) => String(r[h])))),
    ].join('\n') + '\n'
  );
}
