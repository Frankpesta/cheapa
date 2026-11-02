/**
 * The source adapter contract (02-crawler-core.md 2.1). Every store or platform adapter
 * implements `SourceAdapter`; the engine (apps/worker) does scheduling, politeness,
 * change detection and storage. Adapters stay small and never touch a database.
 */
import type { RawListingInput, StorePlatform, StoreRef } from '@cheapa/core';

export type { RawListing, RawListingInput, StoreRef } from '@cheapa/core';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// HTTP (implemented by PoliteHttpClient in 2.2)
// ---------------------------------------------------------------------------

export interface PoliteRequest {
  /** Sent as Accept; defaults to text/html. */
  accept?: 'html' | 'json' | 'xml';
  /** Extra headers. User-Agent is fixed by the client and cannot be overridden. */
  headers?: Record<string, string>;
  /** Validators from a previous fetch; the client sends If-None-Match / If-Modified-Since. */
  etag?: string;
  lastModified?: string;
  signal?: AbortSignal;
}

export interface PoliteResponse {
  /** Final URL after redirects. */
  url: string;
  status: number;
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** Empty when notModified. */
  body: string;
  /** 304: the caller's cached copy is still current. */
  notModified: boolean;
}

/**
 * The only way an adapter may reach the network: rate limited per domain, robots.txt
 * honoured, fixed CheapaBot user agent. Throws `Blocked` on 403/429/challenge pages and
 * `RobotsDisallowed` for disallowed paths. Never wrap it in retries of your own.
 */
export interface PoliteHttpClient {
  get(url: string, init?: PoliteRequest): Promise<PoliteResponse>;
}

// ---------------------------------------------------------------------------
// Adapter context and payloads
// ---------------------------------------------------------------------------

/** pino-compatible subset, so adapters don't depend on a logger package. */
export interface AdapterLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface AdapterContext {
  /** ALWAYS use this; never call fetch/undici directly. */
  http: PoliteHttpClient;
  /** Already bound to storeId / jobId by the engine. */
  log: AdapterLogger;
  /** Aborted on shutdown or job timeout; pass it to http.get and check it in loops. */
  signal: AbortSignal;
}

/**
 * Something to fetch: one product page, or a page of products (search, category,
 * API listing). Prefer pages: many products per request beats one request per product.
 */
export interface ProductRef {
  kind: 'product' | 'page';
  url: string;
  /** Known up front for product refs (lets the engine skip recently fetched items). */
  externalId?: string;
  /** Adapter-private bookkeeping (page number, category id...). Must be JSON. */
  meta?: Record<string, JsonValue>;
}

interface PayloadBase {
  ref: ProductRef;
  /** Final URL after redirects. */
  url: string;
  /** ISO timestamp. */
  fetchedAt: string;
}

/** What `fetch` returns and what fixtures hold. Never contains images or descriptions to store. */
export type RawPayload =
  | (PayloadBase & { format: 'html' | 'xml'; body: string })
  | (PayloadBase & { format: 'json'; body: JsonValue });

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export interface SourceAdapter {
  /** 'jumia', 'konga', 'platform:woocommerce', 'affiliate:temu'. */
  id: string;
  kind: 'custom' | 'platform' | 'affiliate';
  /** Custom adapters: the store domains they handle (bare hosts, as in `stores.domain`). */
  domains?: readonly string[];
  /** Platform/affiliate adapters: the `stores.platform` value they handle. */
  platform?: StorePlatform;
  /** True routes fetches to the Playwright pool (max 2 browsers). Flag it in docs/sources/. */
  needsBrowser: boolean;

  /** Yields refs to fetch. May page through search, category or sitemap. */
  discover(ctx: AdapterContext, store: StoreRef): AsyncIterable<ProductRef>;
  /** Fetch one ref and return its raw payload. */
  fetch(ctx: AdapterContext, ref: ProductRef): Promise<RawPayload>;
  /**
   * Pure and synchronous: raw payload -> listings. No I/O, no clock, no randomness, so
   * it runs unchanged against `__fixtures__/`. Output is validated by `parseListings`.
   */
  parse(raw: RawPayload, store: StoreRef): RawListingInput[];
  /** Query-time search for low-confidence results. Tier 1 stores only. */
  liveSearch?(ctx: AdapterContext, store: StoreRef, query: string, limit: number): Promise<RawListingInput[]>;
}
