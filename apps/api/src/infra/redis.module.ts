import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../config/env.js';

/** noeviction instance: queues, streams, rate-limit buckets. */
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');
/** allkeys-lru instance: caches only. */
export const REDIS_CACHE = Symbol('REDIS_CACHE');

/**
 * Connect before the app starts serving so /health and the first requests don't race
 * the handshake. A Redis that is down at boot doesn't crash the API: it keeps retrying
 * in the background and /health reports it.
 */
async function connect(url: string, name: string): Promise<Redis> {
  const client = new Redis(url, {
    connectionName: name,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  client.on('error', () => undefined); // surfaced through /health; avoids unhandled 'error' events
  await client.connect().catch(() => undefined);
  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_QUEUE,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => connect(env.REDIS_QUEUE_URL, 'cheapa-api-queue'),
    },
    {
      provide: REDIS_CACHE,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => connect(env.REDIS_CACHE_URL, 'cheapa-api-cache'),
    },
  ],
  exports: [REDIS_QUEUE, REDIS_CACHE],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(
    @Inject(REDIS_QUEUE) private readonly queue: Redis,
    @Inject(REDIS_CACHE) private readonly cache: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.queue.quit(), this.cache.quit()]);
  }
}
