import { Blocked, ParseError, RobotsDisallowed, type AdapterRegistry } from '@cheapa/adapters';
import type { AdapterContext, PoliteHttpClient, StoreRef } from '@cheapa/adapters/types';
import type { CatalogDb } from '@cheapa/db/catalog';
import { UnrecoverableError } from 'bullmq';
import type { Alerter } from '../alerts.js';
import { finishCrawlJob, markStoreBlocked, recordCrawlError } from '../crawl/stores.js';
import type { Logger } from '../logger.js';
import type { Queues } from '../queues.js';

/** Everything a job handler needs; built once in main.ts, faked in tests. */
export interface WorkerDeps {
  db: CatalogDb;
  queues: Queues;
  registry: AdapterRegistry;
  /** A PoliteHttp bound to this store's crawl policy (shared limiter + robots cache). */
  httpFor(store: StoreRef, log: Logger): PoliteHttpClient;
  alerter: Alerter;
  log: Logger;
  /** Aborted on shutdown; adapters stop paging and in-flight requests are cancelled. */
  signal: AbortSignal;
  now?: () => Date;
  random?: () => number;
}

export function adapterContext(deps: WorkerDeps, store: StoreRef, log: Logger): AdapterContext {
  return { http: deps.httpFor(store, log), log, signal: deps.signal };
}

/**
 * Expected outcomes (blocked, robots, broken page shape). Never retried; blocked and
 * robots are alerts, not Sentry errors (01-foundation.md 1.7).
 */
export class CrawlOutcome extends UnrecoverableError {
  constructor(
    message: string,
    readonly reportToSentry: boolean,
  ) {
    super(message);
    this.name = 'CrawlOutcome';
  }
}

/**
 * Turns adapter/HTTP errors into store state, crawl-job errors and alerts. Returns
 * normally for a skippable ref (robots); throws for everything else.
 */
export async function handleCrawlError(
  deps: WorkerDeps,
  store: StoreRef,
  crawlJobId: string,
  err: unknown,
  stage: 'discover' | 'fetch',
): Promise<void> {
  if (err instanceof Blocked) {
    await markStoreBlocked(deps.db, store.id);
    await recordCrawlError(deps.db, crawlJobId, {
      kind: `blocked_${err.reason}`,
      url: err.url,
      message: err.message,
    });
    await finishCrawlJob(deps.db, crawlJobId, 'blocked');
    await deps.alerter.send({
      kind: 'store_blocked',
      storeId: store.id,
      message: `${store.name} blocked CheapaBot (${err.reason}); store paused as blocked`,
      details: { url: err.url, domain: store.domain },
    });
    throw new CrawlOutcome(err.message, false);
  }
  if (err instanceof RobotsDisallowed) {
    await recordCrawlError(deps.db, crawlJobId, { kind: 'robots', url: err.url, message: err.message });
    if (stage === 'fetch') return;
    // The adapter's entry point is disallowed: robots.txt changed under us.
    await finishCrawlJob(deps.db, crawlJobId, 'failed');
    await deps.alerter.send({
      kind: 'robots_disallowed',
      storeId: store.id,
      message: `${store.name}: robots.txt now disallows ${err.url}`,
      details: { url: err.url },
    });
    throw new CrawlOutcome(err.message, false);
  }
  const message = err instanceof Error ? err.message : String(err);
  await recordCrawlError(deps.db, crawlJobId, {
    kind: err instanceof ParseError ? 'parse' : 'error',
    message,
  });
  // A page that no longer parses won't parse on retry either; Sentry should hear about it.
  if (err instanceof ParseError) throw new CrawlOutcome(message, true);
  throw err;
}
