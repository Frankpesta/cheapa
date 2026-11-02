import { Blocked, HttpError, ResponseTooLarge, RobotsDisallowed } from '../errors.js';
import type { AdapterLogger, PoliteHttpClient, PoliteRequest, PoliteResponse } from '../types.js';
import { isChallenge } from './challenge.js';
import { clampRps, sleep, type RateLimiter } from './limiter.js';
import { RobotsCache } from './robots.js';

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
  body: string;
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
    const res = await this.follow(new URL(url), buildHeaders(init), init.signal, true);
    if (res.status >= 500) throw new HttpError(res.url, res.status);
    return { ...res, notModified: res.status === 304, body: res.status === 304 ? '' : res.body };
  }

  /** Follows redirects by hand so every hop is rate limited and (optionally) robots-checked. */
  private async follow(
    start: URL,
    headers: Record<string, string>,
    signal: AbortSignal | undefined,
    robots: boolean,
  ): Promise<Received> {
    let current = start;
    for (let hop = 0; hop <= this.opts.maxRedirects; hop += 1) {
      if (robots) await this.checkRobots(current, signal);
      const res = await this.send(current, headers, signal);
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

  private async checkRobots(url: URL, signal?: AbortSignal): Promise<void> {
    const rules = await this.robots.rulesFor(url, async (robotsUrl) => {
      const res = await this.follow(new URL(robotsUrl), { accept: 'text/plain' }, signal, false);
      return { status: res.status, body: res.body };
    });
    if (!rules.isAllowed(url.toString())) throw new RobotsDisallowed(url.toString());
  }

  /** One logical request: rate limited per attempt, retried on network errors and 5xx. */
  private async send(url: URL, headers: Record<string, string>, signal?: AbortSignal): Promise<Received> {
    for (let attempt = 0; ; attempt += 1) {
      const last = attempt >= this.opts.retries;
      await this.limiter.acquire(url.host, this.rps, signal);
      const started = Date.now();
      let res: Received;
      try {
        res = await this.once(url, headers, signal);
      } catch (err) {
        if (last || !isTransient(err, signal)) throw err;
        this.log?.warn({ url: url.toString(), attempt, err: (err as Error).name }, 'http retry after error');
        await sleep(this.backoff(attempt), signal);
        continue;
      }
      this.log?.debug({ url: res.url, status: res.status, attempt, ms: Date.now() - started }, 'http');

      if (res.status === 403) throw new Blocked(res.url, 'status_403');
      if (res.status === 429) throw new Blocked(res.url, 'status_429');
      if (isChallenge(res.headers, res.body)) throw new Blocked(res.url, 'challenge');
      if (res.status >= 500 && !last) {
        await sleep(this.backoff(attempt), signal);
        continue;
      }
      return res;
    }
  }

  private async once(url: URL, headers: Record<string, string>, signal?: AbortSignal): Promise<Received> {
    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    const res = await this.fetch(url, {
      method: 'GET',
      headers: { ...headers, 'user-agent': CHEAPA_USER_AGENT },
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((value, key) => (resHeaders[key] = value));
    const body = await readCapped(res, this.opts.maxBytes, url.toString());
    return { url: url.toString(), status: res.status, headers: resHeaders, body };
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

async function readCapped(res: Response, maxBytes: number, url: string): Promise<string> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new ResponseTooLarge(url, maxBytes);
  }
  if (!res.body) return '';
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
  return new TextDecoder(charsetOf(res.headers.get('content-type'))).decode(Buffer.concat(chunks));
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
