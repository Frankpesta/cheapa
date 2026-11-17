import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { RateDeferred } from '../errors.js';
import { clampRps, effectiveRps, RedisDomainLimiter } from './limiter.js';

const connections: Redis[] = [];
const connect = () => {
  const redis = new Redis(inject('redisUrl'));
  connections.push(redis);
  return redis;
};
afterAll(() => connections.forEach((c) => c.disconnect()));

describe('RedisDomainLimiter', () => {
  it('spaces requests to one domain at 1/rps across two workers', async () => {
    const domain = `shop-${randomUUID()}.ng`;
    const workers = [new RedisDomainLimiter(connect()), new RedisDomainLimiter(connect())];
    const start = Date.now();
    const times = await Promise.all(
      Array.from({ length: 6 }, (_, i) => workers[i % 2]!.acquire(domain, 3).then(() => Date.now() - start)),
    );
    times.sort((a, b) => a - b);
    // 3 rps -> 334 ms apart; allow timer slop but never a burst.
    for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(300);
    expect(times.at(-1)!).toBeGreaterThanOrEqual(5 * 300);
  });

  it('keeps domains independent', async () => {
    const limiter = new RedisDomainLimiter(connect());
    const start = Date.now();
    await Promise.all([`a-${randomUUID()}.ng`, `b-${randomUUID()}.ng`].map((d) => limiter.acquire(d, 1)));
    expect(Date.now() - start).toBeLessThan(300);
  });

  it('stops waiting when the signal aborts', async () => {
    const limiter = new RedisDomainLimiter(connect());
    const domain = `slow-${randomUUID()}.ng`;
    await limiter.acquire(domain, 1);
    const controller = new AbortController();
    const waiting = limiter.acquire(domain, 1, controller.signal);
    controller.abort(new Error('shutdown'));
    await expect(waiting).rejects.toThrow('shutdown');
  });

  it('reserves a far slot and defers instead of sleeping past maxWaitMs', async () => {
    const limiter = new RedisDomainLimiter(connect());
    const domain = `cdn-${randomUUID()}.ng`;
    await limiter.acquire(domain, 1 / 150, undefined, 1000);
    const before = Date.now();
    const err = await limiter.acquire(domain, 1 / 150, undefined, 1000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateDeferred);
    const slotAt = (err as RateDeferred).slotAt;
    expect(slotAt - before).toBeGreaterThan(149_000);
    expect(slotAt - before).toBeLessThan(151_500);
    // The deferred caller's slot is taken: the next one waits a further 150 s.
    const next = await limiter.acquire(domain, 1 / 150, undefined, 1000).catch((e: unknown) => e);
    expect((next as RateDeferred).slotAt - slotAt).toBeGreaterThan(149_000);
  });
});

describe('clampRps', () => {
  it('defaults to 1 and never exceeds 3', () => {
    expect(clampRps(undefined)).toBe(1);
    expect(clampRps(0)).toBe(1);
    expect(clampRps(Number.NaN)).toBe(1);
    expect(clampRps(0.5)).toBe(0.5);
    expect(clampRps(10)).toBe(3);
  });
});

describe('effectiveRps', () => {
  it('takes the slower of the store rate and Crawl-delay', () => {
    expect(effectiveRps(2, undefined)).toBe(2);
    expect(effectiveRps(2, 0)).toBe(2);
    expect(effectiveRps(2, 10)).toBe(0.1);
    expect(effectiveRps(0.05, 10)).toBe(0.05);
  });
});
