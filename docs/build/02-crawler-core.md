# Phase 0 — Crawler Core (Nov 4 – Nov 12, 2026)

Goal: one engine that runs any source adapter on a schedule, politely, with change detection and health monitoring. Adapters stay small; the engine does the hard parts.

---

## 2.1 The adapter contract (`packages/adapters/src/types.ts`)

```ts
export interface SourceAdapter {
  id: string;                         // 'jumia', 'konga', 'platform:woocommerce'
  kind: 'custom' | 'platform' | 'affiliate';
  /** Yields product references to fetch. May page through search, category or sitemap. */
  discover(ctx: AdapterContext, store: Store): AsyncIterable<ProductRef>;
  /** Fetch one product (or a page of products) and return raw payload(s). */
  fetch(ctx: AdapterContext, ref: ProductRef): Promise<RawPayload>;
  /** Pure function: raw payload -> RawListing[]. Must be fixture-tested. */
  parse(raw: RawPayload, store: Store): RawListing[];
  /** Optional live search used at query time for low-confidence results (tier 1 only). */
  liveSearch?(ctx: AdapterContext, query: string, limit: number): Promise<RawListing[]>;
}

export interface AdapterContext {
  http: PoliteHttpClient;   // ALWAYS use this; never raw fetch
  log: Logger;
  signal: AbortSignal;
}
```

Rules:
- `parse` is pure and synchronous-safe so it can run in tests against `__fixtures__/*.json|html`.
- Prefer list/search endpoints that return many products per request over one request per product.
- An adapter declares `needsBrowser: boolean`. If true, the engine routes it to the Playwright pool (max 2 browsers on the lean VPS).

## 2.2 PoliteHttpClient (`packages/adapters/src/http.ts`)

- Per-domain token bucket in `redis-queue`. Default 1 request/second, overridable from `store.crawlPolicy.maxRps` (never above 3).
- robots.txt fetched and cached for 24 h per domain; disallowed paths throw `RobotsDisallowed`.
- Fixed user agent: `CheapaBot/1.0 (+https://cheapa.ng/bot)`.
- Retries: 2 on network errors and 5xx with jittered exponential backoff.
- On 403, 429, or a detected challenge page (Cloudflare/Akamai interstitial markers): **no retry**. Throw `Blocked`; the engine sets store status `blocked` and alerts.
- Conditional requests: send `If-None-Match` / `If-Modified-Since` when the server supports them.
- Response size cap 5 MB; timeout 20 s.

**Acceptance:** tests show rate limiting across two concurrent workers, robots disallow honoured, `Blocked` thrown on a 429 fixture.

## 2.3 Queue and scheduler (`apps/worker`)

BullMQ queues:

| Queue | Job | Concurrency (lean VPS) |
| --- | --- | --- |
| `discover` | Run `adapter.discover` for a store, enqueue fetch jobs | 2 |
| `fetch` | Fetch + parse, then hand to `process` | 6 (HTTP), 1 (browser) |
| `process` | Normalize, upsert listing, write price history, enqueue `embed` if new/changed image | 4 |
| `embed` | CPU embeddings (see `05-visual-search.md`) | 1–2 |
| `match` | Run matcher for new/changed listings | 2 |

Scheduler (repeatable jobs):
- Tier 1: hot products every 6 h (products with recent searches or watches), full sweep daily at 01:00–05:00 WAT.
- Tier 2: daily. Tier 3 long tail: weekly, staggered by store. Tier 4 feeds: daily.
- Jitter all start times by ±20 min.

## 2.4 Upsert and change detection

In `process`:
1. Normalize (`04-normalization-matching.md`).
2. Upsert into `listings` by `(storeId, externalId)`; set `lastSeenAt = now()`.
3. If `priceKobo` or `inStock` changed (or row is new): insert `price_history` row and emit a `price.changed` event onto Redis stream `events:price`.
4. If `imageUrl` changed or listing is new: enqueue `embed`.
5. After a full store sweep, listings not seen for 7 days get `inStock=false`; after 30 days they are hidden from search.

**Acceptance:** re-running the same fixture twice writes zero new history rows; changing one price writes exactly one.

## 2.5 Health and observability

- `crawl_jobs` row per discover run with `itemsFound`, `itemsChanged`, errors.
- Health rule: alert if a store's `itemsFound` drops more than 40% versus its 7-day median, if error rate exceeds 10%, or if status flips to `blocked`.
- Alerts go to a Telegram bot or email (cheapest option); env `ALERT_TELEGRAM_*`.
- Unexpected job failures (after final retry) go to Sentry with `storeId`/`jobId`; blocked/robots outcomes are alerts, not Sentry errors (`01-foundation.md` 1.7).
- Admin page later; for now `scripts/crawl-report.ts` prints a per-store table.

## 2.6 Adapter scaffolding command

`pnpm gen:adapter <id>` creates:

```
packages/adapters/src/<id>/index.ts
packages/adapters/src/<id>/parse.ts
packages/adapters/src/<id>/__fixtures__/
packages/adapters/src/<id>/parse.test.ts
docs/sources/<id>.md   (from template in 03-tier1-adapters.md)
```
