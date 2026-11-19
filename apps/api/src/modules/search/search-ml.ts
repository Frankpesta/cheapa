/**
 * Query-time models for search: the embedder (same models and modelVersion as the
 * worker, so query vectors land in the same space) and the vision service. Loaded and
 * warmed once at boot. Either may be null; search degrades instead of failing.
 */
import { IMAGE_VEC_DIMS, TEXT_VEC_DIMS } from '@cheapa/db/catalog';
import {
  createEmbedService,
  createVisionProvider,
  createVisionService,
  redisSpendLedger,
  type EmbedService,
  type VisionService,
} from '@cheapa/ml';
import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ApiEnv } from '../../config/env.js';

export const SEARCH_ML = Symbol('SEARCH_ML');

export interface SearchMl {
  embed: EmbedService | null;
  vision: VisionService | null;
}

export async function createSearchMl(env: ApiEnv, queue: Redis): Promise<SearchMl> {
  const log = new Logger('SearchMl');
  return { embed: env.EMBED_ENABLED ? await loadEmbed(env, log) : null, vision: loadVision(env, queue, log) };
}

async function loadEmbed(env: ApiEnv, log: Logger): Promise<EmbedService> {
  const service = createEmbedService({
    imageModel: env.EMBED_IMAGE_MODEL,
    textModel: 'minilm-l6',
    ...(env.ML_MODEL_CACHE_DIR ? { cacheDir: env.ML_MODEL_CACHE_DIR } : {}),
    offline: env.ML_OFFLINE,
  });
  if (service.imageDims !== IMAGE_VEC_DIMS || service.textDims !== TEXT_VEC_DIMS) {
    throw new Error(`embedding dims ${service.imageDims}/${service.textDims} != schema`);
  }
  const started = Date.now();
  await service.warmUp();
  log.log({ modelVersion: service.modelVersion, ms: Date.now() - started }, 'search embeddings ready');
  return service;
}

/** No API key = no vision: image search runs on embeddings only. */
function loadVision(env: ApiEnv, queue: Redis, log: Logger): VisionService | null {
  if (!env.ANTHROPIC_API_KEY) {
    log.warn('ANTHROPIC_API_KEY unset: image search runs without the vision read');
    return null;
  }
  const secrets = { anthropicApiKey: env.ANTHROPIC_API_KEY, timeoutMs: env.VISION_TIMEOUT_MS };
  return createVisionService({
    primary: createVisionProvider(env.VISION_PROVIDER, secrets),
    ...(env.VISION_FALLBACK ? { fallback: createVisionProvider(env.VISION_FALLBACK, secrets) } : {}),
    // Spend counters must not be evicted: redis-queue, not redis-cache.
    ledger: redisSpendLedger(queue),
    dailyCapUsd: env.VISION_DAILY_CAP_USD,
    log: { warn: (obj, msg) => log.warn(obj, msg) },
  });
}
