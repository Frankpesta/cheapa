/**
 * Health rules, run once per completed crawl run (02-crawler-core.md 2.5,
 * 11-compliance-and-ops.md 11.3). Blocked stores were already alerted when blocked.
 */
import { daysBefore } from '@cheapa/core';
import {
  claimHealthCheck,
  countFetch,
  medianItemsFound,
  nextPartitionExists,
  storeFreshness,
  type CrawlRun,
} from '../crawl/health.js';
import { getStore, type CrawlableStore } from '../crawl/stores.js';
import type { Alert } from '../alerts.js';
import type { WorkerDeps } from './deps.js';

/** Alert when a run finds this much less than the 7-day median. */
export const ITEMS_DROP_RATIO = 0.4;
/** Alert when more than this share of a run's fetches failed. */
export const ERROR_RATE_LIMIT = 0.1;
/** Tier-1 stores: alert when fewer than this share of visible listings were seen in 48 h. */
export const FRESHNESS_TIER1_MIN = 0.95;

export function evaluateRun(
  run: CrawlRun,
  store: Pick<CrawlableStore, 'id' | 'name' | 'tier'>,
  median: number | null,
  freshness: { visible: number; fresh: number },
): Alert[] {
  const alerts: Alert[] = [];
  const refs = run.refsTotal ?? 0;
  if (refs > 0 && run.fetchesFailed / refs > ERROR_RATE_LIMIT) {
    alerts.push({
      kind: 'error_rate',
      storeId: store.id,
      message: `${store.name}: ${run.fetchesFailed} of ${refs} fetches failed in the last crawl`,
      details: { crawlJobId: run.id, errorRate: Math.round((run.fetchesFailed / refs) * 100) / 100 },
    });
  }
  if (median !== null && median > 0 && run.itemsFound < median * (1 - ITEMS_DROP_RATIO)) {
    alerts.push({
      kind: 'items_dropped',
      storeId: store.id,
      message: `${store.name}: found ${run.itemsFound} items, 7-day median is ${median}`,
      details: { crawlJobId: run.id, itemsFound: run.itemsFound, median },
    });
  }
  if (
    store.tier === 1 &&
    freshness.visible > 0 &&
    freshness.fresh / freshness.visible < FRESHNESS_TIER1_MIN
  ) {
    alerts.push({
      kind: 'stale_listings',
      storeId: store.id,
      message: `${store.name}: only ${freshness.fresh} of ${freshness.visible} listings seen in the last 48 h`,
      details: { crawlJobId: run.id },
    });
  }
  return alerts;
}

/**
 * Runs the rules if this run just became complete (exactly one caller wins the claim).
 * The last page's `process` job may still be pending; its listings were seen by the
 * previous daily sweep (< 48 h ago), so the freshness rule doesn't misfire on them.
 */
export async function checkRunHealth(deps: WorkerDeps, crawlJobId: string): Promise<Alert[]> {
  const run = await claimHealthCheck(deps.db, crawlJobId);
  if (!run) return [];
  const store = await getStore(deps.db, run.storeId);
  if (!store || store.status === 'blocked') return [];
  const now = deps.now?.() ?? new Date();
  const [median, freshness] = await Promise.all([
    medianItemsFound(deps.db, store.id, daysBefore(now, 7), run.id),
    storeFreshness(deps.db, store.id, now),
  ]);
  const alerts = evaluateRun(run, store, median, freshness);
  for (const alert of alerts) await deps.alerter.send(alert);
  deps.log.info(
    {
      storeId: store.id,
      crawlJobId,
      itemsFound: run.itemsFound,
      refs: run.refsTotal,
      failed: run.fetchesFailed,
      alerts: alerts.length,
    },
    'crawl run complete',
  );
  return alerts;
}

/** Called once per fetch job: on success, or after its final failed attempt. */
export async function fetchFinished(deps: WorkerDeps, crawlJobId: string, failed: boolean): Promise<void> {
  await countFetch(deps.db, crawlJobId, failed);
  await checkRunHealth(deps, crawlJobId);
}

/** Daily, after ensuring partitions: next month's must exist before rows arrive. */
export async function checkPartitions(deps: WorkerDeps): Promise<void> {
  if (await nextPartitionExists(deps.db, deps.now?.() ?? new Date())) return;
  await deps.alerter.send({
    kind: 'partition_missing',
    message: 'price_history has no partition for next month; inserts will fail when it starts',
  });
}
