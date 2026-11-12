import { baseEnv, catalogDbEnv, envInt, loadEnv } from '@cheapa/core';
import { z } from 'zod';

const concurrency = (fallback: number) => envInt.pipe(z.number().int().min(1).max(32)).default(fallback);

/**
 * The worker gets the catalog database and the queue Redis only (CLAUDE.md rule 2):
 * no users database, no cache Redis.
 */
export const workerEnvSchema = baseEnv
  .extend(catalogDbEnv.shape)
  .extend({
    REDIS_QUEUE_URL: z.url({ protocol: /^rediss?$/ }),
    APP_VERSION: z.string().default('dev'),
    // Concurrency on the lean VPS (02-crawler-core.md 2.3).
    WORKER_CONCURRENCY_DISCOVER: concurrency(2),
    WORKER_CONCURRENCY_FETCH: concurrency(6),
    WORKER_CONCURRENCY_PROCESS: concurrency(4),
    // Matching serialises per department+category (advisory lock), so a few is plenty.
    WORKER_CONCURRENCY_MATCH: concurrency(2),
    // 04 §4.3: >= merge auto-merges; review..merge merges provisionally and queues a review.
    MATCH_MERGE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.82),
    MATCH_REVIEW_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
    // Ops alerts (02-crawler-core.md 2.5). Both empty = alerts are log lines only.
    ALERT_TELEGRAM_BOT_TOKEN: z.string().trim().optional(),
    ALERT_TELEGRAM_CHAT_ID: z.string().trim().optional(),
    ALERT_THROTTLE_MINUTES: envInt
      .pipe(
        z
          .number()
          .int()
          .min(1)
          .max(7 * 24 * 60),
      )
      .default(360),
  })
  .refine((env) => Boolean(env.ALERT_TELEGRAM_BOT_TOKEN) === Boolean(env.ALERT_TELEGRAM_CHAT_ID), {
    message: 'set both ALERT_TELEGRAM_BOT_TOKEN and ALERT_TELEGRAM_CHAT_ID, or neither',
    path: ['ALERT_TELEGRAM_CHAT_ID'],
  });

export type WorkerEnv = z.output<typeof workerEnvSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  return loadEnv(workerEnvSchema, source);
}
