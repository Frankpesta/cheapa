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
import { createCatalogDb, IMAGE_VEC_DIMS, TEXT_VEC_DIMS } from '@cheapa/db/catalog';
import { createEmbedService, type EmbedService } from '@cheapa/ml';
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
const politeFor = (store: { crawlPolicy: { maxRps?: number } }, storeLog: typeof log) =>
  new PoliteHttp({ limiter, robots, maxRps: store.crawlPolicy.maxRps, log: storeLog });
const embed = env.EMBED_ENABLED ? await loadEmbedService() : undefined;

const deps: WorkerDeps = {
  db: catalog.db,
  queues,
  registry: new AdapterRegistry(allAdapters),
  httpFor: politeFor,
  imagesFor: politeFor,
  ...(embed ? { embed } : {}),
  matchAfterEmbed: env.EMBED_ENABLED,
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
  matchThresholds: { merge: env.MATCH_MERGE_THRESHOLD, review: env.MATCH_REVIEW_THRESHOLD },
};

await upsertSchedules(queues);
const workers = startWorkers(deps, redis, {
  discover: env.WORKER_CONCURRENCY_DISCOVER,
  fetch: env.WORKER_CONCURRENCY_FETCH,
  process: env.WORKER_CONCURRENCY_PROCESS,
  match: env.WORKER_CONCURRENCY_MATCH,
  embed: env.WORKER_CONCURRENCY_EMBED,
});
log.info(
  {
    adapters: deps.registry.list().map((a) => a.id),
    telegramAlerts: Boolean(env.ALERT_TELEGRAM_BOT_TOKEN),
    embedModels: embed?.modelVersion ?? 'disabled',
  },
  'worker started',
);

/** Loads and warms the models once per process (05 §5.1); vector sizes must match the schema. */
async function loadEmbedService(): Promise<EmbedService> {
  const service = createEmbedService({
    imageModel: env.EMBED_IMAGE_MODEL,
    textModel: 'minilm-l6',
    ...(env.ML_MODEL_CACHE_DIR ? { cacheDir: env.ML_MODEL_CACHE_DIR } : {}),
    offline: env.ML_OFFLINE,
  });
  if (service.imageDims !== IMAGE_VEC_DIMS || service.textDims !== TEXT_VEC_DIMS) {
    throw new Error(
      `embedding dims ${service.imageDims}/${service.textDims} != schema ${IMAGE_VEC_DIMS}/${TEXT_VEC_DIMS}; ` +
        'migrate listing_embeddings before switching models',
    );
  }
  const started = Date.now();
  await service.warmUp();
  log.info({ modelVersion: service.modelVersion, ms: Date.now() - started }, 'embedding models ready');
  return service;
}

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
