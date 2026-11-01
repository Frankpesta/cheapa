import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { API_ENV, type ApiEnv } from '../config/env.js';

/** noeviction instance: queues, streams, rate-limit buckets. */
export const REDIS_QUEUE = Symbol('REDIS_QUEUE');
/** allkeys-lru instance: caches only. */
export const REDIS_CACHE = Symbol('REDIS_CACHE');

/** How long boot waits for Redis before serving anyway (degraded, reported by /health). */
const BOOT_CONNECT_WAIT_MS = 3_000;

/**
 * Connect before the app starts serving so /health and the first requests don't race
 * the handshake. A Redis that is down at boot must not block startup: ioredis retries
 * forever, so connect() never settles while it's down. Wait at most BOOT_CONNECT_WAIT_MS,
 * then serve; the client keeps retrying in the background and /health reports it.
 */
async function connect(url: string, name: string): Promise<Redis> {
  const client = new Redis(url, {
    connectionName: name,
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  client.on('error', () => undefined); // surfaced through /health; avoids unhandled 'error' events
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    client.connect().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, BOOT_CONNECT_WAIT_MS);
    }),
  ]);
  clearTimeout(timer);
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
