import type { Redis } from 'ioredis';
import { MAX_RPS } from '@cheapa/core';
import { RateDeferred } from '../errors.js';

/**
 * Per-domain request spacing shared by every worker (02-crawler-core.md 2.2).
 *
 * A token bucket of capacity 1, implemented as slot reservation: the script atomically
 * hands out the next free send time for the domain and pushes it forward by 1/rps.
 * Callers then sleep until their slot, so N workers never exceed `rps` together and no
 * one polls. Uses the Redis clock (TIME) so workers on different hosts agree.
 * Lives in redis-queue (noeviction): an evicted key would silently lift the limit.
 */
const RESERVE = `
local key = KEYS[1]
local interval = tonumber(ARGV[1])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local next_free = tonumber(redis.call('GET', key)) or now
local slot = math.max(now, next_free)
redis.call('SET', key, slot + interval, 'PX', slot - now + interval + 1000)
return slot - now
`;

export const DEFAULT_RPS = 1;

export interface RateLimiter {
  /**
   * Resolves when the caller may send one request to `domain`. With `maxWaitMs`, a slot
   * further away is still reserved, but the call throws `RateDeferred` with its time
   * instead of sleeping.
   */
  acquire(domain: string, rps: number, signal?: AbortSignal, maxWaitMs?: number): Promise<void>;
}

export class RedisDomainLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'ratelimit:crawl:',
  ) {}

  async acquire(domain: string, rps: number, signal?: AbortSignal, maxWaitMs?: number): Promise<void> {
    signal?.throwIfAborted();
    const interval = Math.ceil(1000 / clampRps(rps));
    const waitMs = Number(await this.redis.eval(RESERVE, 1, this.prefix + domain, interval));
    if (maxWaitMs !== undefined && waitMs > maxWaitMs) throw new RateDeferred(domain, Date.now() + waitMs);
    if (waitMs > 0) await sleep(waitMs, signal);
  }
}

/**
 * Store policy may lower the rate, never raise it above MAX_RPS. Rates below 1 rps are
 * allowed: robots.txt Crawl-delay can bring a host down to one request every few minutes.
 */
export function clampRps(rps: number | undefined): number {
  if (rps === undefined || !Number.isFinite(rps) || rps <= 0) return DEFAULT_RPS;
  return Math.min(rps, MAX_RPS);
}

/** The slower of the store's rate and robots.txt `Crawl-delay` (seconds) for that host. */
export function effectiveRps(rps: number, crawlDelaySeconds: number | undefined): number {
  if (!crawlDelaySeconds || !Number.isFinite(crawlDelaySeconds) || crawlDelaySeconds <= 0) return rps;
  return Math.min(rps, 1 / crawlDelaySeconds);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason as Error);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason as Error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
