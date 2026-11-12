// instrument must be first: Sentry hooks modules as they load.
import './instrument.js';
import {
  AdapterRegistry,
  allAdapters,
  PoliteHttp,
  RedisDomainLimiter,
  RobotsCache,
  ROBOTS_AGENT,
} from '@cheapa/adapters';
import { createCatalogDb } from '@cheapa/db/catalog';
import * as Sentry from '@sentry/node';
import { Redis } from 'ioredis';
import { OpsAlerter, RedisAlertThrottle } from './alerts.js';
import { loadWorkerEnv } from './config/env.js';
import { RedisPriceEvents } from './events.js';
import type { WorkerDeps } from './jobs/deps.js';
import { createLogger } from './logger.js';
import { closeQueues, createQueues } from './queues.js';
import { startWorkers, upsertSchedules } from './workers.js';

const env = loadWorkerEnv();
const log = createLogger(env.LOG_LEVEL);
// BullMQ needs maxRetriesPerRequest: null on connections used by workers.
const redis = new Redis(env.REDIS_QUEUE_URL, { maxRetriesPerRequest: null });
const catalog = createCatalogDb(env.CATALOG_DATABASE_URL, { max: 8, applicationName: 'cheapa-worker' });
const queues = createQueues(redis);
const limiter = new RedisDomainLimiter(redis);
const robots = new RobotsCache(ROBOTS_AGENT);
const shutdown = new AbortController();

const deps: WorkerDeps = {
  db: catalog.db,
  queues,
  registry: new AdapterRegistry(allAdapters),
  httpFor: (store, storeLog) =>
    new PoliteHttp({ limiter, robots, maxRps: store.crawlPolicy.maxRps, log: storeLog }),
  alerter: new OpsAlerter({
    log,
    throttle: new RedisAlertThrottle(redis),
    throttleSeconds: env.ALERT_THROTTLE_MINUTES * 60,
    ...(env.ALERT_TELEGRAM_BOT_TOKEN && env.ALERT_TELEGRAM_CHAT_ID
      ? { telegram: { botToken: env.ALERT_TELEGRAM_BOT_TOKEN, chatId: env.ALERT_TELEGRAM_CHAT_ID } }
      : {}),
  }),
  events: new RedisPriceEvents(redis),
  log,
  signal: shutdown.signal,
};

await upsertSchedules(queues);
const workers = startWorkers(deps, redis, {
  discover: env.WORKER_CONCURRENCY_DISCOVER,
  fetch: env.WORKER_CONCURRENCY_FETCH,
  process: env.WORKER_CONCURRENCY_PROCESS,
});
log.info(
  { adapters: deps.registry.list().map((a) => a.id), telegramAlerts: Boolean(env.ALERT_TELEGRAM_BOT_TOKEN) },
  'worker started',
);

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'worker stopping');
  shutdown.abort(new Error(`shutdown (${signal})`));
  await Promise.allSettled(workers.map((w) => w.close()));
  await closeQueues(queues);
  await Promise.allSettled([catalog.close(), Sentry.flush(2000)]);
  redis.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
