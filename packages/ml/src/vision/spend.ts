/**
 * Daily vision spend, counted per Lagos calendar day (VISION_DAILY_CAP_USD, 05 §5.2).
 * The Redis ledger belongs on REDIS_QUEUE_URL: a spend counter must not be evicted.
 */

export interface SpendLedger {
  spentToday(now?: Date): Promise<number>;
  add(usd: number, now?: Date): Promise<void>;
}

/** Lagos is UTC+1 all year (no DST). */
export function lagosDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function memorySpendLedger(): SpendLedger {
  const days = new Map<string, number>();
  return {
    spentToday(now) {
      return Promise.resolve(days.get(lagosDay(now)) ?? 0);
    },
    add(usd, now) {
      const day = lagosDay(now);
      days.set(day, (days.get(day) ?? 0) + usd);
      return Promise.resolve();
    },
  };
}

/** The ioredis calls the ledger needs, so @cheapa/ml does not depend on ioredis. */
export interface SpendRedis {
  get(key: string): Promise<string | null>;
  incrbyfloat(key: string, increment: number): Promise<string>;
  expire(key: string, seconds: number): Promise<number>;
}

const KEY_PREFIX = 'vision:spend:';
const KEEP_SECONDS = 3 * 24 * 60 * 60;

export function redisSpendLedger(redis: SpendRedis): SpendLedger {
  return {
    async spentToday(now) {
      const value = await redis.get(KEY_PREFIX + lagosDay(now));
      return value ? Number(value) : 0;
    },
    async add(usd, now) {
      if (usd <= 0) return;
      const key = KEY_PREFIX + lagosDay(now);
      await redis.incrbyfloat(key, usd);
      await redis.expire(key, KEEP_SECONDS);
    },
  };
}
