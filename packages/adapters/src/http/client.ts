import { Blocked, HttpError, ResponseTooLarge, RobotsDisallowed } from '../errors.js';
import type { AdapterLogger, PoliteHttpClient, PoliteRequest, PoliteResponse } from '../types.js';
import { isChallenge } from './challenge.js';
import { clampRps, effectiveRps, sleep, type RateLimiter } from './limiter.js';
import { RobotsCache, type RobotsRules } from './robots.js';

/** Fixed identity (CLAUDE.md rule 3). Adapters cannot override it. */
export const CHEAPA_USER_AGENT = 'CheapaBot/1.0 (+https://cheapa.ng/bot)';
/** Token matched against robots.txt User-agent lines. */
export const ROBOTS_AGENT = 'CheapaBot';

export const DEFAULTS: {
  timeoutMs: number;
  maxBytes: number;
  retries: number;
  backoffBaseMs: number;
  maxRedirects: number;
} = {
  timeoutMs: 20_000,
  maxBytes: 5 * 1024 * 1024,
  retries: 2,
  backoffBaseMs: 500,
  maxRedirects: 5,
};

const ACCEPT: Record<NonNullable<PoliteRequest['accept']>, string> = {
  html: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  json: 'application/json',
  xml: 'application/xml,text/xml;q=0.9',
};
/** Never sent: our identity is fixed and we only crawl signed out. */
const FORBIDDEN_HEADERS = new Set(['user-agent', 'cookie', 'authorization', 'proxy-authorization']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export interface PoliteHttpOptions {
  limiter: RateLimiter;
  /** Share one per process so robots.txt is fetched once a day per origin. */
  robots?: RobotsCache;
  /** From store.crawlPolicy.maxRps; clamped to (0, 3], default 1. */
  maxRps?: number;
  log?: AdapterLogger;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  backoffBaseMs?: number;
  maxRedirects?: number;
}

interface Received {
  url: string;
  status: number;
  headers: Record<string, string>;
  bytes: Buffer;
}

/** Per-request options for binary fetches (listing images for embeddings). */
export interface BytesRequest {
  /** Overrides the client's maxBytes for this request (images: 2 MB, 05 §5.1). */
  maxBytes?: number;
  signal?: AbortSignal;
  /**
   * Throw `RateDeferred` (slot reserved) instead of sleeping when the host's next slot is
   * further away than this, e.g. a long robots.txt Crawl-delay.
   */
  maxSlotWaitMs?: number;
  /** A slot reserved by an earlier `RateDeferred`; the first request uses it. */
  slotAt?: number;
}

/** How one logical request is sent. */
interface SendOptions {
  maxBytes: number;
  rps: number;
  signal: AbortSignal | undefined;
  maxSlotWaitMs?: number;
  /** Skip the limiter for the first attempt: the caller holds a reserved slot. */
  reserved?: boolean;
  /** robots.txt itself: 401/403 mean "no file" (RFC 9309), not "blocked". */
  robotsFile?: boolean;
}

/** A reserved slot counts as ours from a little before its time (clock skew). */
const SLOT_EARLY_MS = 1000;

export interface BytesResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}

/**
 * The only HTTP client adapters may use (02-crawler-core.md 2.2): per-domain rate limit
 * shared through Redis, robots.txt honoured on every hop, fixed CheapaBot user agent,
 * 2 jittered retries on network errors and 5xx, and an immediate `Blocked` on 403, 429
 * or a challenge page (never retried, never worked around).
 */
export class PoliteHttp implements PoliteHttpClient {
  private readonly limiter: RateLimiter;
  private readonly robots: RobotsCache;
  private readonly fetch: typeof fetch;
  private readonly log: AdapterLogger | undefined;
  private readonly rps: number;
  private readonly opts: typeof DEFAULTS;

  constructor(options: PoliteHttpOptions) {
    this.limiter = options.limiter;
    this.robots = options.robots ?? new RobotsCache(ROBOTS_AGENT);
    this.fetch = options.fetch ?? globalThis.fetch;
    this.log = options.log;
    this.rps = clampRps(options.maxRps);
    this.opts = {
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      maxBytes: options.maxBytes ?? DEFAULTS.maxBytes,
      retries: options.retries ?? DEFAULTS.retries,
      backoffBaseMs: options.backoffBaseMs ?? DEFAULTS.backoffBaseMs,
      maxRedirects: options.maxRedirects ?? DEFAULTS.maxRedirects,
    };
  }

  async get(url: string, init: PoliteRequest = {}): Promise<PoliteResponse> {
    const res = await this.follow(new URL(url), buildHeaders(init), { signal: init.signal });
    if (res.status >= 500) throw new HttpError(res.url, res.status);
    const notModified = res.status === 304;
    return {
      url: res.url,
      status: res.status,
      headers: res.headers,
      notModified,
      body: notModified ? '' : decode(res.bytes, res.headers['content-type']),
    };
  }

  /**
   * Raw bytes (a listing image), with the same politeness as `get`. Bytes stay in memory;
   * callers must never write them to disk or object storage (CLAUDE.md rule 3).
   * Throws HttpError on any non-2xx final status.
   */
  async getBytes(url: string, init: BytesRequest = {}): Promise<BytesResponse> {
    const headers = { accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5' };
    const res = await this.follow(new URL(url), headers, {
      signal: init.signal,
      ...(init.maxBytes !== undefined ? { maxBytes: init.maxBytes } : {}),
      ...(init.maxSlotWaitMs !== undefined ? { maxSlotWaitMs: init.maxSlotWaitMs } : {}),
      reserved: init.slotAt !== undefined && Date.now() >= init.slotAt - SLOT_EARLY_MS,
    });
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.url, res.status);
    return { url: res.url, status: res.status, headers: res.headers, bytes: res.bytes };
  }

  /**
   * Follows redirects by hand so every hop is robots-checked and rate limited at the
   * slower of the store rate and that host's Crawl-delay.
   */
  private async follow(
    start: URL,
    headers: Record<string, string>,
    opts: Partial<SendOptions>,
  ): Promise<Received> {
    let current = start;
    let reserved = opts.reserved ?? false;
    for (let hop = 0; hop <= this.opts.maxRedirects; hop += 1) {
      const rules = await this.checkRobots(current, opts.signal);
      const res = await this.send(current, headers, {
        ...opts,
        maxBytes: opts.maxBytes ?? this.opts.maxBytes,
        rps: effectiveRps(this.rps, rules.crawlDelaySeconds),
        signal: opts.signal,
        reserved,
      });
      reserved = false;
      const location = res.headers['location'];
      if (!REDIRECTS.has(res.status) || !location) return res;
      current = new URL(location, current);
    }
    throw new HttpError(
      start.toString(),
      310,
      `more than ${this.opts.maxRedirects} redirects from ${start.toString()}`,
    );
  }

  private async checkRobots(url: URL, signal?: AbortSignal): Promise<RobotsRules> {
    const rules = await this.robots.rulesFor(url, (robotsUrl) => this.fetchRobots(robotsUrl, signal));
    if (!rules.isAllowed(url.toString())) throw new RobotsDisallowed(url.toString());
    return rules;
  }

  /** robots.txt itself: rate limited at the store rate, redirects followed, never robots-checked. */
  private async fetchRobots(
    robotsUrl: string,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: string }> {
    let current = new URL(robotsUrl);
    for (let hop = 0; hop <= this.opts.maxRedirects; hop += 1) {
      const res = await this.send(
        current,
        { accept: 'text/plain' },
        { maxBytes: this.opts.maxBytes, rps: this.rps, signal, robotsFile: true },
      );
      const location = res.headers['location'];
      if (!REDIRECTS.has(res.status) || !location) {
        return { status: res.status, body: decode(res.bytes, res.headers['content-type']) };
      }
      current = new URL(location, current);
    }
    return { status: 404, body: '' };
  }

  /** One logical request: rate limited per attempt, retried on network errors and 5xx. */
  private async send(url: URL, headers: Record<string, string>, opts: SendOptions): Promise<Received> {
    const { signal } = opts;
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= this.opts.retries;
      if (!(opts.reserved && attempt === 0)) {
        await this.limiter.acquire(url.host, opts.rps, signal, opts.maxSlotWaitMs);
      }
      const started = Date.now();
      let res: Received;
      try {
        res = await this.once(url, headers, signal, opts.maxBytes);
      } catch (err) {
        if (last || !isTransient(err, signal)) throw err;
        this.log?.warn({ url: url.toString(), attempt, err: (err as Error).name }, 'http retry after error');
        await sleep(this.backoff(attempt), signal);
        continue;
      }
      this.log?.debug({ url: res.url, status: res.status, attempt, ms: Date.now() - started }, 'http');

      // RFC 9309 2.3.1.3: 401/403 on robots.txt = no rules (S3-style hosts answer 403 for a missing file).
      if (opts.robotsFile && (res.status === 401 || res.status === 403)) return res;
      if (res.status === 403) throw new Blocked(res.url, 'status_403');
      if (res.status === 429) throw new Blocked(res.url, 'status_429');
      if (isChallenge(res.headers, htmlHead(res))) throw new Blocked(res.url, 'challenge');
      if (res.status >= 500 && !last) {
        await sleep(this.backoff(attempt), signal);
        continue;
      }
      return res;
    }
  }

  private async once(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal | undefined,
    maxBytes: number,
  ): Promise<Received> {
    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    const res = await this.fetch(url, {
      method: 'GET',
      headers: { ...headers, 'user-agent': CHEAPA_USER_AGENT },
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => (resHeaders[key] = value));
    const bytes = await readCapped(res, maxBytes, url.toString());
    return { url: url.toString(), status: res.status, headers: resHeaders, bytes };
  }

  /** Full jitter around base * 2^attempt. */
  private backoff(attempt: number): number {
    return Math.round(this.opts.backoffBaseMs * 2 ** attempt * (0.5 + Math.random()));
  }
}

function buildHeaders(init: PoliteRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(init.headers ?? {})) {
    if (!FORBIDDEN_HEADERS.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
  }
  headers['accept'] ??= ACCEPT[init.accept ?? 'html'];
  if (init.etag) headers['if-none-match'] = init.etag;
  if (init.lastModified) headers['if-modified-since'] = init.lastModified;
  return headers;
}

/** Text for the challenge check: only HTML (or untyped) bodies can be interstitials. */
function htmlHead(res: Received): string {
  const type = res.headers['content-type'] ?? '';
  return type && !type.includes('html') ? '' : decode(res.bytes, type);
}

function decode(bytes: Buffer, contentType: string | undefined): string {
  return new TextDecoder(charsetOf(contentType ?? null)).decode(bytes);
}

async function readCapped(res: Response, maxBytes: number, url: string): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new ResponseTooLarge(url, maxBytes);
  }
  if (!res.body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await res.body.cancel().catch(() => undefined);
      throw new ResponseTooLarge(url, maxBytes);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function charsetOf(contentType: string | null): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase() ?? 'utf-8';
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return 'utf-8';
  }
}

/** Connection failures and our own timeout are retried; caller aborts are not. */
function isTransient(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  return err instanceof TypeError || (err instanceof Error && err.name === 'TimeoutError');
}
