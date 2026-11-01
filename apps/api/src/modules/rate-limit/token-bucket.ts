import type { Redis } from 'ioredis';

/**
 * Atomic token bucket in Redis. Uses the Redis server clock (TIME) so every API
 * instance agrees. Buckets live in redis-queue (noeviction): an evicted bucket
 * would silently reset a limit.
 */
const SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + (now - ts) * refill_per_ms)

local allowed = 0
local retry_ms = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry_ms = math.ceil((cost - tokens) / refill_per_ms)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', key, math.ceil(capacity / refill_per_ms) + 1000)
return { allowed, math.floor(tokens), retry_ms }
`;

export interface BucketResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface BucketSpec {
  /** Max requests in one burst (also the per-window total). */
  capacity: number;
  windowMs: number;
}

export async function takeToken(
  redis: Redis,
  key: string,
  spec: BucketSpec,
  cost = 1,
): Promise<BucketResult> {
  const refillPerMs = spec.capacity / spec.windowMs;
  const raw = (await redis.eval(SCRIPT, 1, key, spec.capacity, refillPerMs, cost)) as [
    number,
    number,
    number,
  ];
  return { allowed: raw[0] === 1, remaining: raw[1], retryAfterMs: raw[2] };
}
